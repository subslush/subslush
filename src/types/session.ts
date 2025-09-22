export interface SessionData {
  userId: string;
  email?: string;
  role?: string;
  createdAt: number;
  lastAccessedAt: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface EncryptedSessionData {
  encryptedData: string;
  iv: string;
  tag: string;
}

export interface SessionCreateOptions {
  email?: string | undefined;
  role?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: SessionData | undefined;
  sessionId?: string | undefined;
  error?: string | undefined;
}

export interface SessionCleanupResult {
  cleanedCount: number;
  totalSessions: number;
  error?: string | undefined;
}

export interface UserSessionInfo {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  isCurrent?: boolean | undefined;
}

export interface SessionMiddlewareOptions {
  required?: boolean | undefined;
  autoRefresh?: boolean | undefined;
  refreshThreshold?: number | undefined;
}

export interface AuthenticatedRequest {
  user?: {
    userId: string;
    email: string;
    role?: string | undefined;
    sessionId: string;
  } | undefined;
  session?: SessionData | undefined;
}