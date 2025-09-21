import { AuthError, User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '../config/supabase';
import { getDatabasePool } from '../config/database';

export interface User {
  id: string;
  email: string;
  created_at: string;
  last_login?: string;
  status: string;
}

export interface RegisterUserData {
  email: string;
  password: string;
}

export interface LoginUserData {
  email: string;
  password: string;
}

export class AuthService {
  private supabase = getSupabaseClient();
  private db = getDatabasePool();

  async registerUser(userData: RegisterUserData): Promise<{ user: User; error: null } | { user: null; error: string }> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
      });

      if (error) {
        return { user: null, error: this.formatAuthError(error) };
      }

      if (!data.user) {
        return { user: null, error: 'Failed to create user account' };
      }

      const localUser = await this.syncUserToDatabase(data.user);
      if (!localUser) {
        return { user: null, error: 'Failed to sync user to local database' };
      }

      return { user: localUser, error: null };
    } catch (error) {
      console.error('Registration error:', error);
      return { user: null, error: 'Internal server error during registration' };
    }
  }

  async loginUser(credentials: LoginUserData): Promise<{ user: User; error: null } | { user: null; error: string }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        return { user: null, error: this.formatAuthError(error) };
      }

      if (!data.user) {
        return { user: null, error: 'Authentication failed' };
      }

      const localUser = await this.updateUserLastLogin(data.user.id);
      if (!localUser) {
        const syncedUser = await this.syncUserToDatabase(data.user);
        if (!syncedUser) {
          return { user: null, error: 'Failed to sync user data' };
        }
        return { user: syncedUser, error: null };
      }

      return { user: localUser, error: null };
    } catch (error) {
      console.error('Login error:', error);
      return { user: null, error: 'Internal server error during login' };
    }
  }

  private async syncUserToDatabase(supabaseUser: SupabaseUser): Promise<User | null> {
    try {
      const query = `
        INSERT INTO users (id, email, created_at, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          status = EXCLUDED.status
        RETURNING id, email, created_at, last_login, status
      `;

      const values = [
        supabaseUser.id,
        supabaseUser.email,
        supabaseUser.created_at,
        'active'
      ];

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login,
        status: user.status
      };
    } catch (error) {
      console.error('Database sync error:', error);
      return null;
    }
  }

  private async updateUserLastLogin(userId: string): Promise<User | null> {
    try {
      const query = `
        UPDATE users
        SET last_login = NOW()
        WHERE id = $1
        RETURNING id, email, created_at, last_login, status
      `;

      const result = await this.db.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login,
        status: user.status
      };
    } catch (error) {
      console.error('Update last login error:', error);
      return null;
    }
  }

  private formatAuthError(error: AuthError): string {
    switch (error.message) {
      case 'User already registered':
        return 'An account with this email already exists';
      case 'Invalid login credentials':
        return 'Invalid email or password';
      case 'Email not confirmed':
        return 'Please check your email and confirm your account';
      case 'Signup requires a valid password':
        return 'Password does not meet requirements';
      default:
        return 'Authentication failed. Please try again.';
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, email, created_at, last_login, status
        FROM users
        WHERE id = $1 AND status = 'active'
      `;

      const result = await this.db.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login,
        status: user.status
      };
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, email, created_at, last_login, status
        FROM users
        WHERE email = $1 AND status = 'active'
      `;

      const result = await this.db.query(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login,
        status: user.status
      };
    } catch (error) {
      console.error('Get user by email error:', error);
      return null;
    }
  }
}