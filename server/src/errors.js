// Errors our app expects and understands, with a fixed code that code and tests
// can check, and a message a person can read. Raw database errors should be
// turned into one of these before they leave a service.
// `details` is optional extra data for the client (e.g. login choices). Never secrets.
export class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
