/**
 * Fastify Module Augmentation
 *
 * This file provides complete TypeScript support for Fastify request interface
 * including authentication, session management, and admin access control.
 */

import { SessionData } from './session';

declare module 'fastify' {
  interface FastifyRequest {
    user?:
      | {
          userId: string;
          email: string;
          firstName?: string | undefined;
          lastName?: string | undefined;
          displayName?: string | undefined;
          role?: string | undefined;
          sessionId: string;
          isAdmin: boolean;
        }
      | undefined;
    session?: SessionData | undefined;
  }
}
