
/**
 * 고급 프롬프트 빌더 (Section 5)
 * - 공식체 문체, 근거 인용, 불확실성 처리, 금지 규칙 명시
 * - 토큰 가드: history turn 제한 + 프롬프트 글자수 제한(근사치) 적용
 * - 출력: OpenAI/Anthropic/Gemini 공통 messages 배열
 */

const MAX_TURNS = Number(process.env.MAX_HISTORY_TURNS || 8);
const MAX_CHARS = Number(process.env.MAX_PROMPT_CHARS || 8000);

/**
 * history를 최근 N턴으로 자르는 유틸
 */
function clampHistory(history = [], maxTurns = MAX_TURNS){
  if(!Array.isArray(history) || history.length === 0) return [];
  // user/assistant 한 쌍을 1턴으로 간주 → 2*turns 메시지 유지
  const maxMsgs = Math.max(2 * maxTurns, 0);
  if(history.length <= maxMsgs) return history;
  return history.slice(history.length - maxMsgs);
}

/**
 * 문자수 근사치로 프롬프트 길이 가드
 * (정확한 토큰 카운터가 아니므로 모델 한계 대비 여유를 두어 설정)
 */
function clampByChars(str, limit = MAX_CHARS){
  if(typeof str !== 'string') return '';
  if(str.length <= limit) return str;
  // 앞부분을 잘라내고 가장 중요한 뒤쪽 맥락을 보존
  return str.slice(str.length - limit);
}

/**
 * snippets(검색 근거) → 문자열 포맷팅
 */
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

/**
 * history → 문자열 요약 블록 (최근 메시지 우선)
 */
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
 * 메인 빌더
 */
export function buildMessages({ userMessage, history = [], snippets = [] }){
  const system = [
    '당신은 기업 내부 규정집 기반의 공식 어시스턴트입니다.',
    '답변은 반드시 공식적인 존댓말(~입니다)로 작성하세요.',
    '출력 형식: 간결한 단락 또는 불릿을 사용하고, 마지막에 근거를 요약 인용합니다.',
    '반드시 근거가 되는 문서/조항을 간단히 인용하세요. 형식: [문서명 §조항] 여러 개면 쉼표로 구분.',
    '근거가 불충분하거나 불명확하면 "명시된 근거를 찾을 수 없습니다."라고 답하고, 확인 절차를 제안하세요.',
    '금지: 추측성 수치 생성, 허위/임의 링크 제공, 사적 견해.',
    '의견을 요구받아도 규정 근거가 없는 경우 명확히 근거 부재를 밝히세요.'
  ].join(' ');

  // 1) history turn 제한
  const hClamped = clampHistory(history, MAX_TURNS);

  // 2) 블록 조립
  const snippetBlock = buildSnippetBlock(snippets);
  const historyBlock = buildHistoryBlock(hClamped);

  const userParts = [];
  if(snippetBlock) userParts.push(snippetBlock);
  if(historyBlock) userParts.push(`이전 대화 요약:\n${historyBlock}`);
  userParts.push(`사용자 질문:\n${userMessage || ''}`);

  let user = userParts.filter(Boolean).join('\n\n');
  // 3) 글자수 제한 (근사)
  if(user.length > MAX_CHARS){
    user = clampByChars(user, MAX_CHARS);
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
