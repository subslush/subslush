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
      perfEnabled?: boolean;
      serverTimings?: Array<{
        name: string;
        dur: number;
        desc?: string;
      }>;
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
      perfEnabled?: boolean;
    }

    interface Error {
      message: string;
      errorId?: string;
    }

    interface Platform {}
  }
}

export {};
