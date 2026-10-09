// Tells TypeScript that requireAuth adds userId to the request.
// It is undefined on routes that don't use requireAuth.
declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export {};
