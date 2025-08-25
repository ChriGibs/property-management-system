function jsonErrorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.expose ? err.message : (process.env.NODE_ENV === 'development' ? err.message : 'Server error');
  const details = err.details || undefined;
  if (status >= 500) {
    console.error(err.stack || err);
  }
  res.status(status).json({ error: { code, message, details } });
}

function createHttpError(status, message, { code = undefined, details = undefined, expose = true } = {}) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.code = code;
  err.details = details;
  err.expose = expose;
  return err;
}

module.exports = { jsonErrorHandler, createHttpError };


