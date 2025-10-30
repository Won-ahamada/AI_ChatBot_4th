
# KERIS Phase 1 – Stateless RAG Chatbot

## 특징
- 단일 사용자 UI (모델 선택 + 채팅 + 안내사항)
- **무상태**: 세션/쿠키/DB 없음, 대화 저장 없음
- `/api/chat` → Anything LLM(내장 RAG) 또는 외부 RAG + OpenAI
- `/api/news` → 정적 JSON

## 실행
```bash
cd keris-phase1
cp .env.example .env
npm install
npm run start
# http://localhost:8080
```

## 구성 선택
### A) Anything LLM 사용 (가장 단순)
- `ANYTHING_BASE`, `ANYTHING_TOKEN`, `WORKSPACE_ID` 설정.
- 검색/생성 모두 워크스페이스에 위임(별도 Vector DB 불필요).

### B) 외부 RAG + OpenAI
- `OPENAI_API_KEY` 필수, `QDRANT_URL`, `QDRANT_COLLECTION` 설정.
- 질의 임베딩 생성 → Qdrant `top-k` 검색 → 근거 스니펫을 프롬프트에 주입.

## 환경변수
- 모델 매핑: `MODEL_MAP_CHATGPT`, `MODEL_MAP_CLAUDE`, `MODEL_MAP_GEMINI`
- 임베딩 모델: `OPENAI_EMBEDDING_MODEL`(기본 `text-embedding-3-small`)
- 타임아웃: `LLM_TIMEOUT_MS` (기본 10000ms)

## 구조
```
public/
  index.html
  assets/css/style.css
  assets/js/app.js
  assets/js/api.js
  notices/news.json
server/
  server.js
  routes/chat.js
  routes/news.js
  middlewares/logging.js
  middlewares/security.js
  config/index.js
  config/models.js
  services/llm.js          # LLM 호출/라우팅/타임아웃/재시도
  services/rag.js          # (옵션) Qdrant 읽기 전용 검색
  services/prompt.js       # 스니펫+히스토리 프롬프트 빌더
```


## 프롬프트/토큰 가드
- `MAX_HISTORY_TURNS` (기본 8): 최근 N턴만 포함
- `MAX_PROMPT_CHARS` (기본 8000): 프롬프트 최대 글자수 (근사)


## 보안/로깅 정책 (섹션 6)
- **CSP**: self만 허용(스크립트/스타일), 이미지/폰트 data: 허용
- **헤더**: X-Content-Type-Options, Referrer-Policy, Frameguard 등
- **허용 메서드**: GET / POST / OPTIONS (기타 405)
- **CORS**: `ALLOWED_ORIGINS` 화이트리스트
- **RateLimit**: `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` 환경변수로 제어
- **로깅**: JSON Line 형식 — 예) `{"rid":"abc123","method":"POST","path":"/api/chat","status":200,"latency_ms":42}`
- **에러 포맷**: `{ "error": { "code": "<CODE>", "message": "<MSG>", "detail?": {} } }`


## Phase 1 최종 체크리스트
- [ ] 새로고침/재접속 시 히스토리 0 (클라이언트 변수만 사용)
- [ ] `/api/chat` 프록시 정상 (Anything LLM 또는 OpenAI)
- [ ] (선택) Qdrant 설정 시 RAG 검색 스니펫 포함
- [ ] 본문/프롬프트/응답 본문 로깅 금지 확인
- [ ] CORS 화이트리스트 동작
- [ ] RateLimit 동작 및 로그 확인
- [ ] `/healthz` 가 버전/업타임 출력
