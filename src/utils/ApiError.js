/**
 * ApiError
 * -----
 * The single error abstraction used throughout the CareerForge API.
 * It carries an HTTP status code, a message, an optional array of
 * validation / business errors, and a stack trace. By forcing every
 * failure through this class we avoid leaking raw driver messages
 * or stack traces to the client in production.
 */

class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.errors = Array.isArray(errors) ? errors : [errors];
    this.success = false;

    if (stack && typeof stack === "string") {
      this.stack = stack;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /* 400 */
  static badRequest(message = "Bad request", errors = []) {
    return new ApiError(400, message, errors);
  }

  /* 401 */
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }

  /* 403 */
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }

  /* 404 */
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }

  /* 409 */
  static conflict(message = "Conflict") {
    return new ApiError(409, message);
  }

  /* 500 */
  static internal(message = "Internal server error") {
    return new ApiError(500, message);
  }

  /* 501 */
  static notImplemented(message = "Not implemented") {
    return new ApiError(501, message);
  }
}

module.exports = ApiError;
