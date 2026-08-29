import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { ValidationError } from '../validators';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ValidationError) {
    logger.warn(`Validation error on ${req.method} ${req.path}: ${err.message}`, { code: err.code, statusCode: err.statusCode });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR');
  if (process.env.NODE_ENV === 'production') logger.error(`Request failed: ${req.method} ${req.path}`, { statusCode, code, errorName: err?.name || 'Error' });
  else logger.error(`Error on ${req.method} ${req.path}: ${err.message}`, err);
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message || 'Ocorreu um erro interno no servidor.';

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}
