
/**
 * JSON 라인 로깅 (섹션 6)
 * - 요청 ID / 경로 / 상태코드 / 응답시간(ms)
 * - 본문/프롬프트/응답 본문은 기록하지 않음
 */
export default function logging(){
  return (req, res, next) => {
    const start = Date.now();
    const rid = Math.random().toString(36).slice(2, 10);
    res.on('finish', () => {
      const ms = Date.now() - start;
      const line = {
        rid,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latency_ms: ms
      };
      try {
        console.log(JSON.stringify(line));
      } catch {
        // JSON 실패 시 무시
      }
    });
    next();
  };
}
