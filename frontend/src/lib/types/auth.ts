export interface User {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  pinSetAt?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  redirect?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  message: string;
  user: User;
  accessToken?: string;
  sessionId?: string;
  requiresEmailVerification?: boolean;
}

export interface ConfirmEmailRequest {
  accessToken: string;
  refreshToken?: string;
}

export interface LogoutRequest {
  allDevices?: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetResponse {
  message: string;
}

export interface VerifiedTrackResponse {
  message: string;
}

export interface PasswordResetConfirmRequest {
  accessToken: string;
  refreshToken?: string;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetConfirmResponse {
  message: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  lastAccessedAt: string;
  ipAddress?: string;
  userAgent?: string;
  isCurrent: boolean;
}

export interface SessionsResponse {
  sessions: Session[];
  totalCount: number;
  currentSessionId: string;
}

export interface RefreshResponse {
  message: string;
  user: User;
  accessToken: string;
  sessionId: string;
}
