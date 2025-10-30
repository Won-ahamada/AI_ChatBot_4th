
import { resolveModelId } from '../config/models.js';
import { buildMessages } from './prompt.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 10000);
const RETRIES = 1;

function withTimeout(ms){
  const ctrl = new AbortController();
  const id = setTimeout(()=> ctrl.abort(new Error('요청 시간이 초과되었습니다.')), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function safeFetch(url, opts, timeoutMs){
  const { signal, clear } = withTimeout(timeoutMs || DEFAULT_TIMEOUT_MS);
  try{
    const res = await fetch(url, { ...(opts||{}), signal });
    clear();
    return res;
  }catch(e){
    clear();
    throw e;
  }
}

function formatKoreanError(e){
  const msg = (e && e.message) ? String(e.message) : '알 수 없는 오류';
  if(msg.includes('초과') || msg.includes('abort')){
    return '모델 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
  }
  if(msg.includes('CORS')) return '네트워크 정책으로 차단되었습니다. 관리자에게 문의하세요.';
  return '모델 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

async function callOpenAI({ message, history, model, snippets }){
  const key = process.env.OPENAI_API_KEY;
  if(!key) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

  const msgs = buildMessages({ userMessage: message, history, snippets });

  const res = await safeFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: msgs, temperature: 0.2 })
  });

  if(!res.ok){
    const txt = await res.text();
    throw new Error(`OpenAI 오류: ${res.status} ${txt}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return content || '';
}

export async function generateLLM({ message, history, userModel, snippets }){
  const modelId = resolveModelId(userModel);
  let lastErr = null;

  for(let attempt=0; attempt<=RETRIES; attempt++){
    try{
      if(process.env.OPENAI_API_KEY){
        return await callOpenAI({ message, history, model: modelId, snippets });
      }
      return `[${userModel || 'chatgpt'}] "${message}" 에 대한 응답 예시입니다. (API 키 미설정)`;
    }catch(e){
      lastErr = e;
      if(attempt < RETRIES){
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
    }
  }
  throw new Error(formatKoreanError(lastErr));
}
