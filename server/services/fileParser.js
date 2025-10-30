
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * 파일을 파싱하여 텍스트 추출
 * @param {string} filePath - 파일 경로
 * @param {string} originalName - 원본 파일명
 * @returns {Promise<{text: string, metadata: object}>}
 */
export async function parseFile(filePath, originalName){
  const ext = path.extname(originalName).toLowerCase();
  
  try{
    switch(ext){
      case '.pdf':
        return await parsePDF(filePath, originalName);
      case '.docx':
        return await parseDOCX(filePath, originalName);
      case '.txt':
        return await parseTXT(filePath, originalName);
      default:
        throw new Error('지원하지 않는 파일 형식입니다.');
    }
  }catch(err){
    throw new Error(`파일 파싱 실패 (${ext}): ${err.message}`);
  }
}

async function parsePDF(filePath, originalName){
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  
  return {
    text: data.text || '',
    metadata: {
      filename: originalName,
      type: 'pdf',
      pages: data.numpages || 0,
      parsedAt: new Date().toISOString()
    }
  };
}

async function parseDOCX(filePath, originalName){
  const result = await mammoth.extractRawText({ path: filePath });
  
  return {
    text: result.value || '',
    metadata: {
      filename: originalName,
      type: 'docx',
      parsedAt: new Date().toISOString(),
      warnings: result.messages || []
    }
  };
}

async function parseTXT(filePath, originalName){
  const text = fs.readFileSync(filePath, 'utf-8');
  
  return {
    text: text || '',
    metadata: {
      filename: originalName,
      type: 'txt',
      parsedAt: new Date().toISOString()
    }
  };
}

/**
 * 텍스트를 청크로 분할
 * @param {string} text - 전체 텍스트
 * @param {number} chunkSize - 청크 크기 (글자 수)
 * @param {number} overlap - 오버랩 크기
 * @returns {string[]}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200){
  const chunks = [];
  let start = 0;
  
  while(start < text.length){
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += (chunkSize - overlap);
  }
  
  return chunks.filter(c => c.trim().length > 0);
}
