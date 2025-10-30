
/**
 * 보안 미들웨어 (섹션 6)
 * - Helmet 기본 + CSP 세분화
 * - XSS/MIME 방지 헤더
 * - Referrer Policy
 * - 허용 HTTP 메서드 제한
 */
import helmet from 'helmet';

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  fontSrc: ["'self'", "data:"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
};

export default function security(){
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: cspDirectives
      },
      referrerPolicy: { policy: "no-referrer" },
      frameguard: { action: "sameorigin" },
      hidePoweredBy: true,
      xssFilter: true, // Helmet v7에서 제거되었으나, 옵션 유지(무해)
      noSniff: true,
    }),
    // 허용 HTTP 메서드 제한
    (req, res, next) => {
      const allowed = ['GET', 'POST', 'OPTIONS'];
      if(!allowed.includes(req.method)) {
        return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: '허용되지 않은 메서드입니다.' }});
      }
      next();
    },
    // 기타 헤더
    (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    }
  ];
}
