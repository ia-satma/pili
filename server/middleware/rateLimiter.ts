import rateLimit from "express-rate-limit";

// Strict limit for expensive AI operations
export const agentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: { message: "Demasiadas solicitudes de agente. Intenta de nuevo en un minuto.", retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limit for exports/uploads
export const exportRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  max: 10, // 10 requests per minute
  message: { message: "Demasiadas solicitudes de exportación. Intenta de nuevo en un minuto.", retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload rate limit
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Demasiadas cargas de archivo. Intenta de nuevo en un minuto.", retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
});

// System docs rate limit
export const systemDocsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { message: "Demasiadas solicitudes de documentación. Intenta de nuevo en un minuto.", retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
});
