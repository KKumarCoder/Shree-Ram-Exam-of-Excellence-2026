export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = Number(err.status);
  let message = err.message;
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON request body.'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Request body is too large.'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'File is too large. Photos: maximum 2 MB; receipts: maximum 3 MB.'; }
  else if (err.name === 'MulterError') { status = 400; message = 'Invalid upload. Select one file in the expected field.'; }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid record identifier.'; }
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
  if (status >= 500) {
    console.error(JSON.stringify({ event: 'request_failed', type: err.name }));
    if (status === 500) message = 'Unexpected server error.';
  }
  res.status(status).json({ error: message || 'Request failed.' });
}
