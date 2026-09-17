/** One error shape for every route: `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const unauthorized = (code: string, message: string) => new ApiError(401, code, message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const tooManyRequests = (code: string, message: string) => new ApiError(429, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
