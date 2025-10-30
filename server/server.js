
/**
 * Phase 1 API 서버 (무상태) - 파일 업로드 기능 추가
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import logging from './middlewares/logging.js';
import security from './middlewares/security.js';
import chatRouter from './routes/chat.js';
import newsRouter from './routes/news.js';
import uploadRouter from './routes/upload.js';
import { initializeCollection } from './services/rag.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

// 파서
app.use(express.json({ limit: '1mb' }));
// 보안 & 로깅
security().forEach(mw => app.use(mw));
app.use(logging());

// CORS 화이트리스트
const allow = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if(!origin || allow.length===0 || allow.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  credentials: false,
  methods: ['GET','POST','DELETE','OPTIONS'],
}));

// OPTIONS 프리플라이트 처리
app.options('*', cors());

// Rate Limit (환경변수로 제어)
const windowMs = Number(process.env.RATE_LIMIT_WINDOW || 60000);
const maxReq = Number(process.env.RATE_LIMIT_MAX || 60);
const limiter = rateLimit({ windowMs, max: maxReq, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// 정적 서빙
app.use(express.static(path.join(__dirname, '..', 'public')));

// 라우트
import fs from 'fs';

app.get('/healthz', (req, res)=> {
  try{
    const fp = path.join(__dirname, '..', 'public', 'version.json');
    const txt = fs.readFileSync(fp, 'utf-8');
    const ver = JSON.parse(txt);
    res.status(200).json({ 
      ok:true, 
      version: ver.version, 
      phase: ver.phase, 
      uptime_sec: Math.round(process.uptime()),
      rag_enabled: Boolean(process.env.QDRANT_URL && process.env.OPENAI_API_KEY)
    });
  }catch(e){
    res.status(200).json({ 
      ok:true, 
      version: process.env.APP_VERSION || '1.0.0', 
      uptime_sec: Math.round(process.uptime()),
      rag_enabled: Boolean(process.env.QDRANT_URL && process.env.OPENAI_API_KEY)
    });
  }
});

app.use('/api/chat', chatRouter);
app.use('/api/news', newsRouter);
app.use('/api/upload', uploadRouter);

// 404
app.use((req, res, next) => {
  return res.status(404).json({ error: { code:'NOT_FOUND', message:'요청하신 경로를 찾을 수 없습니다.' } });
});

// 에러 핸들러 (일관 포맷)
app.use((err, req, res, next)=>{
  const msg = (err && err.message) ? String(err.message) : '서버 오류가 발생했습니다.';
  const status = err.status || 500;
  res.status(status).json({ error: { code: 'INTERNAL', message: msg } });
});

const PORT = process.env.PORT || 8080;

// Qdrant 컬렉션 초기화 (선택적)
if(process.env.QDRANT_URL && process.env.OPENAI_API_KEY){
  initializeCollection().catch(err => {
    console.warn('⚠️  Qdrant 컬렉션 초기화 실패:', err.message);
  });
}

app.listen(PORT, ()=>{
  console.log(JSON.stringify({ 
    msg:'listening', 
    port: PORT,
    rag_enabled: Boolean(process.env.QDRANT_URL && process.env.OPENAI_API_KEY)
  }));
});
