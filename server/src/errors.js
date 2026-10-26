// Errors our app expects and understands, with a fixed code that code and tests
// can check, and a message a person can read. Raw database errors should be
// turned into one of these before they leave a service.
export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
