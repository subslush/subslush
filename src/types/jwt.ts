export interface JWTPayload {
  userId: string;
  email: string;
  role?: string | undefined;
  sessionId: string;
  iat?: number | undefined;
  exp?: number | undefined;
}

export interface JWTTokens {
  accessToken: string;
  refreshToken?: string | undefined;
}

export interface TokenValidationResult {
  isValid: boolean;
  payload?: JWTPayload | undefined;
  error?: string | undefined;
  needsRefresh?: boolean | undefined;
}

export interface RefreshTokenResult {
  success: boolean;
  tokens?: JWTTokens | undefined;
  error?: string | undefined;
}

export interface JWTServiceConfig {
  secret: string;
  algorithm: 'HS256' | 'RS256';
  expiresIn: string | number;
  refreshExpiresIn?: string | number | undefined;
  issuer?: string | undefined;
  audience?: string | undefined;
}

export interface DecodedJWT {
  header: {
    alg: string;
    typ: string;
  };
  payload: JWTPayload;
  signature: string;
}