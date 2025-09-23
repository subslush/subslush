export interface ExtendedUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  role?: string;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  timezone?: string;
  languagePreference?: string;
  notificationPreferences?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
    marketing?: boolean;
  };
  createdAt: string;
  lastLoginAt?: string;
  profileUpdatedAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  displayName?: string | undefined;
  role?: string | undefined;
  status: string;
  timezone?: string | undefined;
  languagePreference?: string | undefined;
  notificationPreferences?:
    | {
        email?: boolean | undefined;
        push?: boolean | undefined;
        sms?: boolean | undefined;
        marketing?: boolean | undefined;
      }
    | undefined;
  createdAt: string;
  lastLoginAt?: string | undefined;
  profileUpdatedAt?: string | undefined;
}

export interface UserProfileUpdate {
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  displayName?: string | undefined;
  timezone?: string | undefined;
  languagePreference?: string | undefined;
  notificationPreferences?:
    | {
        email?: boolean | undefined;
        push?: boolean | undefined;
        sms?: boolean | undefined;
        marketing?: boolean | undefined;
      }
    | undefined;
}

export interface UserStatusUpdateData {
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  reason: string;
}

export interface UserServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export interface UserProfileOptions {
  includeMetadata?: boolean | undefined;
  includeSessions?: boolean | undefined;
  userId?: string | undefined;
}

export interface UserStatusAuditLog {
  id: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string;
  changedAt: string;
  ipAddress?: string;
}

export interface UserDatabaseRecord {
  id: string;
  email: string;
  created_at: string;
  last_login?: string;
  status: string;
  display_name?: string;
  user_timezone?: string;
  language_preference?: string;
  notification_preferences?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
    marketing?: boolean;
  };
  profile_updated_at?: string;
}

export interface UserSupabaseMetadata {
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface UserSessionWithProfile extends UserProfile {
  sessionId: string;
  activeSessions?: number;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
  totalSessions: number;
}

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

export interface UserManagementFilters {
  status?: UserStatus;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'email' | 'created_at' | 'last_login' | 'status';
  sortOrder?: 'asc' | 'desc';
}
