
/**
 * 외부 Vector DB (Qdrant) 읽기 전용 검색
 * - Phase 1: 임베딩은 사전 배치가 원칙이며, 여기서는 질의 임베딩만 생성
 * - 필요 ENV:
 *   QDRANT_URL, QDRANT_API_KEY(옵션), QDRANT_COLLECTION
 *   OPENAI_API_KEY (임베딩 생성을 위해), OPENAI_EMBEDDING_MODEL(선택, 기본 text-embedding-3-small)
 */
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || '';
const EMB_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function enabled(){
  return Boolean(QDRANT_URL && QDRANT_COLLECTION && process.env.OPENAI_API_KEY);
}

async function embedQuery(query){
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
    body: JSON.stringify({ input: query, model: EMB_MODEL })
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error('임베딩 생성 실패: ' + t);
  }
  const j = await r.json();
  return j?.data?.[0]?.embedding;
}

export async function retrieveSnippets({ query, topK=5, scoreThreshold=0.0 }){
  if(!enabled()) return [];
  const vector = await embedQuery(query);
  if(!Array.isArray(vector)) return [];

  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      ...(QDRANT_API_KEY ? {'api-key': QDRANT_API_KEY} : {})
    },
    body: JSON.stringify({
      vector,
      limit: topK,
      with_payload: true,
      score_threshold: scoreThreshold || undefined
    })
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error('Qdrant 검색 실패: ' + t);
  }
  const j = await r.json();
  const points = j?.result || [];
  // 표준화된 스니펫 포맷으로 변환
  return points.map(p => ({
    text: p?.payload?.text || p?.payload?.chunk || '',
    doc: p?.payload?.doc || p?.payload?.source || p?.payload?.document || '문서',
    ref: p?.payload?.ref || p?.payload?.section || '',
    score: p?.score || 0
  })).filter(s => s.text);
}

export function ragEnabled(){
  return enabled();
}
