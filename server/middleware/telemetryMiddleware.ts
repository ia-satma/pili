import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export function telemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const userId = req.user?.id || null;
    
    storage.createApiTelemetry({
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
      userId,
    }).catch((err) => {
      console.error("[Telemetry] Failed to record API telemetry:", err);
    });
  });
  
  next();
}
