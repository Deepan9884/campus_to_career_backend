/**
 * asyncHandler
 * -----
 * Wraps async Express route handlers so that rejected promises
 * automatically call `next(err)` instead of hanging the request.
 */

const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
