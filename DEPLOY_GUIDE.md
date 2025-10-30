
# 배포 가이드 (Phase 1)

본 문서는 Vercel, Render, Cloud Run 3가지 경로로 배포하는 절차를 요약합니다.

## 공통 준비
- Node.js 18+
- `.env` 작성 (샘플: `.env.example`)
- 로컬 실행 확인: `npm install && npm start`

---

## 1) Vercel
1. 레포지토리 연결 (GitHub/GitLab/Bitbucket)
2. **Framework Preset: Other** 선택
3. Build Command: `npm install` → Output: `public` (정적) / API는 Serverless Function 구성 필요 시 `api` 디렉터리 사용 또는 Node 서버 모드(Advanced)
4. 환경변수 등록: `.env` 내용 그대로 Vercel Project Settings → Environment Variables
5. 배포 후 `https://<project>.vercel.app/healthz` 확인

> 참고: 장기 운영 시 Node Serverless 핸들러로 마이그레이션하거나 Render/Cloud Run 사용 고려

---

## 2) Render
1. New + Web Service → 레포지토리 선택
2. Runtime: Node → Start Command: `npm start`
3. 환경변수 등록
4. Health Check Path: `/healthz`
5. 배포 도메인에서 `/`와 `/api/chat` 테스트

---

## 3) Cloud Run (GCP)
1. `Dockerfile` 작성 후 `gcloud run deploy`
2. 최소 인스턴스 0, 동시성 80, 리전 가까운 곳 선택
3. 환경변수 설정(Secrets Manager 권장)
4. Cloud Run URL `/healthz` 확인

---

## 운영 팁
- JSON Line 로그 수집(Cloud Logging or ELK)
- Rate Limit 정책 조정 (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`)
- CORS 화이트리스트(내부망/도메인만 허용)
