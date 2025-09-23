import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { sessionService } from './sessionService';
import { Logger } from '../utils/logger';
import {
  UserProfile,
  UserProfileUpdate,
  UserStatusUpdateData,
  UserServiceResponse,
  UserProfileOptions,
  UserDatabaseRecord,
  UserSupabaseMetadata,
  UserStatus,
} from '../types/user';

class UserService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }

  private get pool(): any {
    return getDatabasePool();
  }

  async getUserProfile(
    userId: string,
    options: UserProfileOptions = {}
  ): Promise<UserServiceResponse<UserProfile>> {
    try {
      const { includeMetadata = true, includeSessions = false } = options;

      // Get user from PostgreSQL database
      const dbResult = await this.pool.query(
        'SELECT id, email, created_at, last_login, status FROM users WHERE id = $1 AND status != $2',
        [userId, 'deleted']
      );

      if (dbResult.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      const dbUser: UserDatabaseRecord = dbResult.rows[0];

      // Get user metadata from Supabase if requested
      let metadata: UserSupabaseMetadata = {};
      if (includeMetadata) {
        try {
          const { data: supabaseUser } =
            await this.supabase.auth.admin.getUserById(userId);
          if (supabaseUser?.user?.user_metadata) {
            metadata = supabaseUser.user.user_metadata;
          }
        } catch (error) {
          Logger.warn(
            'Failed to fetch Supabase metadata for user:',
            userId,
            error
          );
        }
      }

      // Build profile response
      const profile: UserProfile = {
        id: dbUser.id,
        email: dbUser.email,
        firstName: metadata.first_name,
        lastName: metadata.last_name,
        displayName: metadata.display_name,
        role: metadata.role || 'user',
        status: dbUser.status,
        timezone: metadata.timezone,
        languagePreference: metadata.language_preference,
        notificationPreferences: metadata.notification_preferences,
        createdAt: dbUser.created_at,
        lastLoginAt: dbUser.last_login,
        profileUpdatedAt: metadata.profile_updated_at,
      };

      // Include session count if requested
      if (includeSessions) {
        try {
          const sessions = await sessionService.getUserSessions(userId);
          (profile as any).activeSessions = sessions.length;
        } catch (error) {
          Logger.warn('Failed to fetch session count for user:', userId, error);
        }
      }

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      Logger.error('Get user profile error:', error);
      return {
        success: false,
        error: 'Failed to retrieve user profile',
      };
    }
  }

  async updateUserProfile(
    userId: string,
    updates: UserProfileUpdate,
    updatedBy: string
  ): Promise<UserServiceResponse<UserProfile>> {
    try {
      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');

        // Update email in database if provided
        if (updates.email) {
          // Check if email is already taken
          const emailCheck = await client.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [updates.email, userId]
          );

          if (emailCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return {
              success: false,
              error: 'Email already in use',
            };
          }

          await client.query('UPDATE users SET email = $1 WHERE id = $2', [
            updates.email,
            userId,
          ]);
        }

        // Update metadata in Supabase
        const metadataUpdates: UserSupabaseMetadata = {
          profile_updated_at: new Date().toISOString(),
        };

        if (updates.firstName !== undefined)
          metadataUpdates.first_name = updates.firstName;
        if (updates.lastName !== undefined)
          metadataUpdates.last_name = updates.lastName;
        if (updates.displayName !== undefined)
          metadataUpdates.display_name = updates.displayName;
        if (updates.timezone !== undefined)
          metadataUpdates.timezone = updates.timezone;
        if (updates.languagePreference !== undefined)
          metadataUpdates.language_preference = updates.languagePreference;
        if (updates.notificationPreferences !== undefined)
          metadataUpdates.notification_preferences =
            updates.notificationPreferences;

        // Update Supabase user metadata
        if (updates.email) {
          const { error: emailError } =
            await this.supabase.auth.admin.updateUserById(userId, {
              email: updates.email,
              user_metadata: metadataUpdates,
            });

          if (emailError) {
            await client.query('ROLLBACK');
            return {
              success: false,
              error: 'Failed to update user email',
              details: emailError.message,
            };
          }
        } else {
          const { error: metadataError } =
            await this.supabase.auth.admin.updateUserById(userId, {
              user_metadata: metadataUpdates,
            });

          if (metadataError) {
            await client.query('ROLLBACK');
            return {
              success: false,
              error: 'Failed to update user metadata',
              details: metadataError.message,
            };
          }
        }

        await client.query('COMMIT');

        // Log the update
        Logger.info(`User profile updated: ${userId} by ${updatedBy}`);

        // Return updated profile
        return await this.getUserProfile(userId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Update user profile error:', error);
      return {
        success: false,
        error: 'Failed to update user profile',
      };
    }
  }

  async updateUserStatus(
    userId: string,
    statusData: UserStatusUpdateData,
    updatedBy: string,
    ipAddress?: string
  ): Promise<UserServiceResponse<UserProfile>> {
    try {
      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');

        // Get current user status
        const currentUserResult = await client.query(
          'SELECT status FROM users WHERE id = $1',
          [userId]
        );

        if (currentUserResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return {
            success: false,
            error: 'User not found',
          };
        }

        const oldStatus = currentUserResult.rows[0].status;

        // Validate status transition
        if (!this.isValidStatusTransition(oldStatus, statusData.status)) {
          await client.query('ROLLBACK');
          return {
            success: false,
            error: `Invalid status transition from ${oldStatus} to ${statusData.status}`,
          };
        }

        // Update user status
        await client.query('UPDATE users SET status = $1 WHERE id = $2', [
          statusData.status,
          userId,
        ]);

        // Create audit log entry (we'll create this table in a migration if needed)
        try {
          await client.query(
            `INSERT INTO user_status_audit (user_id, old_status, new_status, reason, changed_by, changed_at, ip_address)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
            [
              userId,
              oldStatus,
              statusData.status,
              statusData.reason,
              updatedBy,
              ipAddress,
            ]
          );
        } catch (auditError) {
          // If audit table doesn't exist, just log the change
          Logger.info(
            `User status audit log: ${userId} changed from ${oldStatus} to ${statusData.status} by ${updatedBy}. Reason: ${statusData.reason}`,
            auditError
          );
        }

        await client.query('COMMIT');

        // If user is being deactivated, invalidate all sessions
        if (['inactive', 'suspended', 'deleted'].includes(statusData.status)) {
          try {
            const deletedSessions =
              await sessionService.deleteUserSessions(userId);
            Logger.info(
              `Invalidated ${deletedSessions} sessions for user ${userId} due to status change to ${statusData.status}`
            );
          } catch (sessionError) {
            Logger.error('Failed to invalidate user sessions:', sessionError);
          }
        }

        Logger.info(
          `User status updated: ${userId} from ${oldStatus} to ${statusData.status} by ${updatedBy}`
        );

        // Return updated profile
        return await this.getUserProfile(userId);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Update user status error:', error);
      return {
        success: false,
        error: 'Failed to update user status',
      };
    }
  }

  async updateLastLogin(userId: string): Promise<boolean> {
    try {
      await this.pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
      return true;
    } catch (error) {
      Logger.error('Update last login error:', error);
      return false;
    }
  }

  async getUserSessions(userId: string): Promise<UserServiceResponse<any[]>> {
    try {
      const sessions = await sessionService.getUserSessionsInfo(userId);
      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      Logger.error('Get user sessions error:', error);
      return {
        success: false,
        error: 'Failed to retrieve user sessions',
      };
    }
  }

  async deleteUserAccount(
    userId: string,
    reason: string,
    deletedBy: string
  ): Promise<UserServiceResponse<boolean>> {
    try {
      // Mark user as deleted instead of actually deleting
      const result = await this.updateUserStatus(
        userId,
        { status: 'deleted', reason },
        deletedBy
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to update user status',
        };
      }

      Logger.info(`User account marked as deleted: ${userId} by ${deletedBy}`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      Logger.error('Delete user account error:', error);
      return {
        success: false,
        error: 'Failed to delete user account',
      };
    }
  }

  private isValidStatusTransition(from: UserStatus, to: UserStatus): boolean {
    const validTransitions: Record<UserStatus, UserStatus[]> = {
      active: ['inactive', 'suspended', 'deleted'],
      inactive: ['active', 'suspended', 'deleted'],
      suspended: ['active', 'inactive', 'deleted'],
      deleted: [], // No transitions from deleted status
    };

    return validTransitions[from]?.includes(to) || false;
  }

  async isUserActive(userId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT status FROM users WHERE id = $1',
        [userId]
      );

      return result.rows.length > 0 && result.rows[0].status === 'active';
    } catch (error) {
      Logger.error('Check user active status error:', error);
      return false;
    }
  }

  async getUserByEmail(
    email: string
  ): Promise<UserServiceResponse<UserProfile>> {
    try {
      const result = await this.pool.query(
        'SELECT id FROM users WHERE email = $1 AND status != $2',
        [email.toLowerCase(), 'deleted']
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      return await this.getUserProfile(result.rows[0].id);
    } catch (error) {
      Logger.error('Get user by email error:', error);
      return {
        success: false,
        error: 'Failed to retrieve user',
      };
    }
  }
}

export const userService = new UserService();
export default userService;
