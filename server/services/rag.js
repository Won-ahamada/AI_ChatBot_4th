
import { chunkText } from './fileParser.js';

/**
 * 외부 Vector DB (Qdrant) 읽기/쓰기
 * - 질의 임베딩 생성 및 검색
 * - 문서 청크 임베딩 및 저장
 */
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'keris_documents';
const EMB_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function enabled(){
  return Boolean(QDRANT_URL && process.env.OPENAI_API_KEY);
}

/**
 * OpenAI 임베딩 생성
 */
async function embedText(text){
  if(!process.env.OPENAI_API_KEY){
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }

  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type':'application/json', 
      'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ 
      input: typeof text === 'string' ? text : text.join('\n'), 
      model: EMB_MODEL 
    })
  });

  if(!r.ok){
    const t = await r.text();
    throw new Error('임베딩 생성 실패: ' + t);
  }

  const j = await r.json();
  
  // 단일 텍스트인 경우
  if(typeof text === 'string'){
    return j?.data?.[0]?.embedding;
  }
  
  // 배열인 경우
  return j?.data?.map(d => d.embedding) || [];
}

/**
 * Qdrant에 문서 청크 저장
 * @param {object} params
 * @param {string} params.text - 전체 텍스트
 * @param {string} params.filename - 파일명
 * @param {object} params.metadata - 메타데이터
 */
export async function storeDocumentChunks({ text, filename, metadata = {} }){
  if(!enabled()){
    console.warn('RAG가 비활성화되어 있어 문서를 저장하지 않습니다.');
    return;
  }

  // 1. 텍스트를 청크로 분할
  const chunks = chunkText(text, 1000, 200);
  
  if(chunks.length === 0){
    throw new Error('청크를 생성할 수 없습니다.');
  }

  // 2. 각 청크의 임베딩 생성 (배치)
  const embeddings = await embedText(chunks);

  // 3. Qdrant에 저장할 포인트 생성
  const points = chunks.map((chunk, idx) => ({
    id: Date.now() + idx,
    vector: embeddings[idx],
    payload: {
      text: chunk,
      doc: filename,
      document: filename,
      source: filename,
      chunk_index: idx,
      total_chunks: chunks.length,
      ...metadata
    }
  }));

  // 4. Qdrant에 업로드
  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points`;
  
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json',
      ...(QDRANT_API_KEY ? {'api-key': QDRANT_API_KEY} : {})
    },
    body: JSON.stringify({ points })
  });

  if(!r.ok){
    const t = await r.text();
    throw new Error('Qdrant 저장 실패: ' + t);
  }

  console.log(`✅ ${filename}: ${chunks.length}개 청크 저장 완료`);
  return { chunks: chunks.length };
}

/**
 * Qdrant에서 유사 문서 검색
 */
export async function retrieveSnippets({ query, topK=5, scoreThreshold=0.0 }){
  if(!enabled()) return [];
  
  const vector = await embedText(query);
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
    ref: p?.payload?.ref || p?.payload?.section || p?.payload?.chunk_index || '',
    score: p?.score || 0
  })).filter(s => s.text);
}

export function ragEnabled(){
  return enabled();
}

/**
 * Qdrant 컬렉션 초기화 (선택적)
 */
export async function initializeCollection(){
  if(!enabled()) return;

  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}`;
  
  // 컬렉션 존재 확인
  const checkRes = await fetch(url, {
    headers: QDRANT_API_KEY ? {'api-key': QDRANT_API_KEY} : {}
  });

  if(checkRes.ok){
    console.log(`✅ Qdrant 컬렉션 "${QDRANT_COLLECTION}" 이미 존재합니다.`);
    return;
  }

  // 컬렉션 생성
  const createRes = await fetch(`${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json',
      ...(QDRANT_API_KEY ? {'api-key': QDRANT_API_KEY} : {})
    },
    body: JSON.stringify({
      vectors: {
        size: 1536, // text-embedding-3-small dimension
        distance: 'Cosine'
      }
    })
  });

  if(!createRes.ok){
    const t = await createRes.text();
    throw new Error('Qdrant 컬렉션 생성 실패: ' + t);
  }

  console.log(`✅ Qdrant 컬렉션 "${QDRANT_COLLECTION}" 생성 완료`);
}
