
import dotenv from 'dotenv';
dotenv.config();

/**
 * 필수/선택 환경변수 검증 및 설정 객체 생성
 */
const required = [
  'PORT',
  'MODEL_MAP_CHATGPT'
];
const missing = required.filter(k => !process.env[k]);
if(missing.length){
  console.error('❌ 필수 환경변수가 누락되었습니다:', missing.join(', '));
  process.exit(1);
}

export const config = {
  app: {
    version: process.env.APP_VERSION || '1.0.0',
    port: Number(process.env.PORT),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean)
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 60),
  },
  llm: {
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 10000),
    map: {
      chatgpt: process.env.MODEL_MAP_CHATGPT || 'gpt-4o-mini',
      claude: process.env.MODEL_MAP_CLAUDE || 'claude-3-5-sonnet-20240620',
      gemini: process.env.MODEL_MAP_GEMINI || 'gemini-1.5-pro',
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  },
  qdrant: {
    url: process.env.QDRANT_URL || '',
    apiKey: process.env.QDRANT_API_KEY || '',
    collection: process.env.QDRANT_COLLECTION || '',
  }
};
