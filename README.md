
# KERIS Phase 1 – RAG Chatbot with File Upload

## 주요 특징
- 🚀 **파일 드래그 앤 드롭**: PDF, DOCX, TXT 문서 업로드
- 🔍 **실시간 RAG 검색**: 업로드된 문서 기반 질의응답
- 💬 **다중 모델 지원**: ChatGPT, Claude, Gemini 선택 가능
- 🎨 **현대적 UI**: 그라디언트 배경, 반투명 글래스모피즘 디자인
- 🔒 **보안**: Rate limiting, CORS, CSP 헤더 적용

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어서 필수 값 입력:
# - OPENAI_API_KEY (필수)
# - QDRANT_URL (필수)
# - QDRANT_API_KEY (필수)

# 3. 서버 실행
npm start

# 4. 브라우저에서 접속
# http://localhost:8080
```

## 필수 환경변수

### OpenAI API
```bash
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Qdrant Vector Database
```bash
QDRANT_URL=https://your-instance.qdrant.tech
QDRANT_API_KEY=your-api-key
QDRANT_COLLECTION=keris_documents
```

## Qdrant 설정 방법

### 옵션 1: Qdrant Cloud (권장)
1. [qdrant.tech](https://qdrant.tech)에서 무료 계정 생성
2. 새 클러스터 생성 (1GB Free tier 사용 가능)
3. API 키 발급
4. 클러스터 URL 복사 → `.env`의 `QDRANT_URL`에 입력

### 옵션 2: Docker로 로컬 실행
```bash
docker run -p 6333:6333 qdrant/qdrant
```
```bash
# .env 설정
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=  # 로컬은 비워둬도 됨
```

## 사용 방법

### 1. 문서 업로드
- 왼쪽 사이드바에서 파일을 드래그 앤 드롭
- 또는 영역 클릭하여 파일 선택
- 지원 형식: **PDF, DOCX, TXT**
- 최대 파일 크기: **10MB**

### 2. 질문하기
- 업로드된 문서가 자동으로 임베딩되어 Vector DB에 저장됩니다
- 메시지 입력창에 질문 입력
- 시스템이 자동으로 관련 문서를 검색하여 답변 생성

### 3. 모델 선택
- ChatGPT (GPT-4o-mini) - 빠르고 경제적
- Claude Sonnet 3.5 - 긴 문맥 처리
- Gemini 1.5 Pro - 구글의 최신 모델

## 프로젝트 구조

```
keris-phase1/
├── public/
│   ├── index.html              # 메인 UI
│   ├── assets/
│   │   ├── css/style.css       # 스타일 (드래그 앤 드롭 UI 포함)
│   │   └── js/
│   │       ├── api.js          # API 클라이언트 (파일 업로드 포함)
│   │       └── app.js          # 메인 앱 로직
│   └── version.json
├── server/
│   ├── server.js               # Express 서버
│   ├── config/
│   │   ├── index.js
│   │   └── models.js
│   ├── middlewares/
│   │   ├── logging.js          # JSON Line 로깅
│   │   └── security.js         # 보안 헤더
│   ├── routes/
│   │   ├── chat.js             # 채팅 API
│   │   ├── news.js             # 공지사항 (제거 예정)
│   │   └── upload.js           # 파일 업로드 API ⭐ NEW
│   └── services/
│       ├── llm.js              # LLM 호출
│       ├── rag.js              # Vector DB 검색/저장 ⭐ UPDATED
│       ├── fileParser.js       # 파일 파싱 ⭐ NEW
│       └── prompt.js           # 프롬프트 빌더
├── uploads/                    # 업로드된 파일 저장소 (자동 생성)
├── package.json
├── .env.example
└── README.md
```

## API 엔드포인트

### 파일 업로드
- **POST** `/api/upload` - 파일 업로드 및 임베딩
- **GET** `/api/upload` - 업로드된 파일 목록
- **DELETE** `/api/upload/:filename` - 파일 삭제

### 채팅
- **POST** `/api/chat` - 질의응답
  ```json
  {
    "message": "규정 10조의 내용은?",
    "model": "chatgpt",
    "history": []
  }
  ```

### 헬스체크
- **GET** `/healthz` - 서버 상태 확인

## 파일 처리 플로우

```
1. 사용자 파일 업로드 (PDF/DOCX/TXT)
         ↓
2. 서버가 파일 파싱 (텍스트 추출)
         ↓
3. 텍스트를 1000자 청크로 분할 (200자 오버랩)
         ↓
4. 각 청크를 OpenAI로 임베딩 생성
         ↓
5. Qdrant Vector DB에 저장
         ↓
6. 사용자 질문 시 유사도 검색 (Top-5)
         ↓
7. 관련 청크를 컨텍스트로 LLM에 전달
         ↓
8. 답변 생성 및 근거 출처 표시
```

## 보안 정책

- **CSP**: 스크립트/스타일은 self만 허용
- **CORS**: 화이트리스트 기반 (환경변수 설정)
- **Rate Limit**: 기본 60 req/min (조정 가능)
- **파일 크기 제한**: 10MB
- **허용 메서드**: GET, POST, DELETE, OPTIONS만

## 로깅

JSON Line 형식으로 표준 출력:
```json
{"rid":"abc123","method":"POST","path":"/api/chat","status":200,"latency_ms":42}
```

## 주의사항

⚠️ **Phase 1은 무상태(Stateless) 원칙을 따릅니다:**
- 대화 히스토리는 클라이언트(브라우저 메모리)에만 저장
- 새로고침 시 대화 내용 초기화
- 업로드된 파일은 서버에 저장되지만, 재시작 시 유지되지 않음
- Vector DB(Qdrant)만 영구 저장

## 배포

Vercel, Render, Cloud Run 지원. 자세한 내용은 `DEPLOY_GUIDE.md` 참조.

## 라이센스

MIT
