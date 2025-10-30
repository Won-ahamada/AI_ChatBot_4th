
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parseFile } from '../services/fileParser.js';
import { storeDocumentChunks } from '../services/rag.js';

const router = Router();

// 업로드 디렉터리 설정
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if(!fs.existsSync(UPLOAD_DIR)){
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if(allowed.includes(ext)){
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. (PDF, DOCX, TXT만 가능)'));
    }
  }
});

// POST /api/upload - 파일 업로드
router.post('/', upload.single('file'), async (req, res) => {
  try{
    if(!req.file){
      return res.status(400).json({ error: { code:'NO_FILE', message:'파일이 업로드되지 않았습니다.' } });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    // 파일 파싱
    const { text, metadata } = await parseFile(filePath, originalName);

    if(!text || text.trim().length === 0){
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: { code:'EMPTY_FILE', message:'파일에서 텍스트를 추출할 수 없습니다.' } });
    }

    // Vector DB에 저장
    await storeDocumentChunks({
      text,
      filename: originalName,
      metadata
    });

    res.json({
      success: true,
      file: {
        name: originalName,
        size: req.file.size,
        type: req.file.mimetype,
        chunks: Math.ceil(text.length / 1000)
      }
    });
  }catch(err){
    console.error('업로드 오류:', err);
    if(req.file?.path && fs.existsSync(req.file.path)){
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: { code:'UPLOAD_ERROR', message: err.message || '업로드 처리 중 오류가 발생했습니다.' } });
  }
});

// GET /api/upload - 업로드된 파일 목록
router.get('/', (req, res) => {
  try{
    const files = fs.readdirSync(UPLOAD_DIR).map(filename => {
      const stats = fs.statSync(path.join(UPLOAD_DIR, filename));
      return {
        name: filename.replace(/^\d+_/, ''), // 타임스탬프 제거
        filename: filename,
        size: stats.size,
        uploadedAt: stats.mtime
      };
    });
    res.json({ files });
  }catch(err){
    res.json({ files: [] });
  }
});

// DELETE /api/upload/:filename - 파일 삭제
router.delete('/:filename', (req, res) => {
  try{
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    
    if(fs.existsSync(filePath)){
      fs.unlinkSync(filePath);
      res.json({ success: true, message: '파일이 삭제되었습니다.' });
    } else {
      res.status(404).json({ error: { code:'NOT_FOUND', message:'파일을 찾을 수 없습니다.' } });
    }
  }catch(err){
    res.status(500).json({ error: { code:'DELETE_ERROR', message: err.message } });
  }
});

export default router;
