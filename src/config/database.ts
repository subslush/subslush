import { Pool, PoolConfig } from 'pg';
import { EnvironmentConfig } from '../types/environment';
import { Logger } from '../utils/logger';

let pool: Pool;

export function createDatabasePool(config: EnvironmentConfig): Pool {
  if (pool) {
    return pool;
  }

  const poolConfig: PoolConfig = {
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_DATABASE,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(poolConfig);

  pool.on('error', (err: Error) => {
    Logger.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  return pool;
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    Logger.info(
      'Database connection successful:',
      result.rows[0]?.current_time
    );
    return true;
  } catch (error) {
    Logger.error('Database connection failed:', error);
    return false;
  }
}

export function getDatabasePool(): Pool {
  if (!pool) {
    throw new Error(
      'Database pool not initialized. Call createDatabasePool first.'
    );
  }
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
