import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { observability } from '../observability';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const request = observability.beginRequest({ method: req.method, path: req.path, requestId: req.headers['x-request-id'] as string | undefined, context: { ip: req.ip, userAgent: req.get('user-agent') } });
  (req as any).observabilityContext = request.context;
  res.setHeader('X-Request-ID', request.context.requestId!);
  const { method, path, ip } = req;

  observability.run(request.context, () => {
    res.on('finish', () => {
      observability.run(request.context, () => {
        observability.endRequest(request.span, res.statusCode);
        const duration = request.span.durationMs || 0;
        const status = res.statusCode;

    // Filter sensitive query/body properties before logging
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '[REDACTED]';
    if (safeBody.secretKey) safeBody.secretKey = '[REDACTED]';
    if (safeBody.secret) safeBody.secret = '[REDACTED]';

        logger.info(`HTTP ${method} ${path} ${status} ${duration}ms`, {
          ip,
          userAgent: req.get('user-agent'),
          status,
          duration,
        });
      });
    });
    next();
  });
}
