/**
 * 고급 프롬프트 빌더 (Section 5)
 * - RAG 파일 유무에 따라 동적으로 프롬프트 변경
 * - 파일 없을 때: 일반 대화 모드
 * - 파일 있을 때: 근거 기반 응답 모드
 */

const MAX_TURNS = Number(process.env.MAX_HISTORY_TURNS || 8);
const MAX_CHARS = Number(process.env.MAX_PROMPT_CHARS || 8000);

function clampHistory(history = [], maxTurns = MAX_TURNS){
  if(!Array.isArray(history) || history.length === 0) return [];
  const maxMsgs = Math.max(2 * maxTurns, 0);
  if(history.length <= maxMsgs) return history;
  return history.slice(history.length - maxMsgs);
}

function clampByChars(str, limit = MAX_CHARS){
  if(typeof str !== 'string') return '';
  if(str.length <= limit) return str;
  return str.slice(str.length - limit);
}

function buildSnippetBlock(snippets = []){
  if(!Array.isArray(snippets) || snippets.length === 0) return '';
  const lines = ['다음은 검색된 관련 근거입니다:'];
  snippets.forEach((s, i) => {
    const doc = s?.doc || '문서';
    const ref = s?.ref ? ` · ${s.ref}` : '';
    const text = (s?.text || '').replace(/\s+/g, ' ').trim();
    lines.push(`- [${i+1}] (${doc}${ref}) ${text}`);
  });
  return lines.join('\n');
}

function buildHistoryBlock(history = []){
  if(!Array.isArray(history) || history.length === 0) return '';
  const lines = [];
  history.forEach(h => {
    if(h?.role === 'user') lines.push(`사용자: ${h.content || ''}`);
    else if(h?.role === 'assistant') lines.push(`어시스턴트: ${h.content || ''}`);
  });
  return lines.join('\n');
}

/**
 * 메인 빌더 - RAG 유무에 따라 시스템 프롬프트 변경
 */
export function buildMessages({ userMessage, history = [], snippets = [] }){
  const hasSnippets = Array.isArray(snippets) && snippets.length > 0;
  
  // RAG 파일이 있을 때와 없을 때 다른 시스템 프롬프트
  const system = hasSnippets ? [
    '당신은 업로드된 문서 기반의 공식 어시스턴트입니다.',
    '답변은 반드시 공식적인 존댓말(~입니다)로 작성하세요.',
    '출력 형식: 간결한 단락 또는 불릿을 사용하고, 마지막에 근거를 요약 인용합니다.',
    '반드시 근거가 되는 문서/조항을 간단히 인용하세요. 형식: [문서명 §조항] 여러 개면 쉼표로 구분.',
    '근거가 불충분하거나 불명확하면 "업로드된 문서에서 명시된 근거를 찾을 수 없습니다."라고 답하고, 확인 절차를 제안하세요.',
    '금지: 추측성 수치 생성, 허위/임의 링크 제공, 사적 견해.',
    '의견을 요구받아도 규정 근거가 없는 경우 명확히 근거 부재를 밝히세요.'
  ].join(' ') : [
    '당신은 친절하고 전문적인 AI 어시스턴트입니다.',
    '답변은 정중한 존댓말(~입니다)로 작성하세요.',
    '사용자의 질문에 명확하고 도움이 되는 답변을 제공하세요.',
    '확실하지 않은 정보는 추측하지 말고 솔직히 알려주세요.',
    '필요시 추가 정보를 요청하거나 명확한 설명을 제공하세요.'
  ].join(' ');

  const hClamped = clampHistory(history, MAX_TURNS);

  const userParts = [];
  
  // RAG 검색 결과가 있을 때만 스니펫 추가
  if(hasSnippets){
    const snippetBlock = buildSnippetBlock(snippets);
    if(snippetBlock) userParts.push(snippetBlock);
  }
  
  const historyBlock = buildHistoryBlock(hClamped);
  if(historyBlock) userParts.push(`이전 대화 요약:\n${historyBlock}`);
  
  userParts.push(`사용자 질문:\n${userMessage || ''}`);

  let user = userParts.filter(Boolean).join('\n\n');
  
  if(user.length > MAX_CHARS){
    user = clampByChars(user, MAX_CHARS);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
