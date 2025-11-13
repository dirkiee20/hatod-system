import { HttpError } from '../utils/httpError.js';

export const notFoundHandler = (req, res, next) => {
  next(new HttpError(404, `Route ${req.originalUrl} not found`));
};

export const errorHandler = (err, req, res, next) => {
  const status = err instanceof HttpError ? err.statusCode : 500;
  const message =
    err instanceof HttpError ? err.message : 'Internal server error';
  const response = {
    status: 'error',
    message
  };

  if (err.details) {
    response.details = err.details;
  }

  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  console.error(err);
  res.status(status).json(response);
};

