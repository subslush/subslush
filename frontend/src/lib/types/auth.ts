export interface User {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
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
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  message: string;
  user: User;
  accessToken: string;
  sessionId: string;
}

export interface LogoutRequest {
  allDevices?: boolean;
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