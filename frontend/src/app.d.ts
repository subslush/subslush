declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        sessionId: string;
      } | null;
    }

    interface PageData {
      user?: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
      };
      currency?: string | null;
    }

    interface Error {
      message: string;
      errorId?: string;
    }

    interface Platform {}
  }
}

export {};
