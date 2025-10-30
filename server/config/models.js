
import dotenv from 'dotenv';
dotenv.config();

export function resolveModelId(userModel){
  const m = (userModel || 'chatgpt').toLowerCase();
  if(m === 'claude') return process.env.MODEL_MAP_CLAUDE || 'claude-3-5-sonnet-20240620';
  if(m === 'gemini') return process.env.MODEL_MAP_GEMINI || 'gemini-1.5-pro';
  return process.env.MODEL_MAP_CHATGPT || 'gpt-4o-mini';
}
