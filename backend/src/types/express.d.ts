declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Request-scoped logger with requestId and userId in every log */
      log?: {
        debug: (msg: string, meta?: object) => void;
        info: (msg: string, meta?: object) => void;
        warn: (msg: string, meta?: object) => void;
        error: (msg: string, meta?: object) => void;
        child: (meta: object) => Express.Request['log'];
      };
    }
  }
}

export {};
