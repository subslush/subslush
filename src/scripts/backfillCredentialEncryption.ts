import { env } from '../config/environment';
import {
  createDatabasePool,
  testDatabaseConnection,
  closeDatabasePool,
  getDatabasePool,
} from '../config/database';
import { credentialsEncryptionService } from '../utils/encryption';
import { Logger } from '../utils/logger';

async function backfillTable(params: {
  table: string;
  idColumn: string;
  valueColumn: string;
}): Promise<void> {
  const pool = getDatabasePool();
  const rows = await pool.query(
    `SELECT ${params.idColumn} AS id, ${params.valueColumn} AS value
     FROM ${params.table}
     WHERE ${params.valueColumn} IS NOT NULL`
  );

  let updated = 0;
  for (const row of rows.rows) {
    const raw = row.value as string | null;
    if (!raw) continue;
    if (credentialsEncryptionService.isEncryptedPayload(raw)) {
      continue;
    }
    const encrypted = credentialsEncryptionService.encryptToString(raw);
    await pool.query(
      `UPDATE ${params.table}
       SET ${params.valueColumn} = $1
       WHERE ${params.idColumn} = $2`,
      [encrypted, row.id]
    );
    updated += 1;
  }

  Logger.info('Credential backfill completed', {
    table: params.table,
    updated,
  });
}

async function tableExists(tableName: string): Promise<boolean> {
  const pool = getDatabasePool();
  const result = await pool.query('SELECT to_regclass($1) AS exists', [
    tableName,
  ]);
  return Boolean(result.rows[0]?.exists);
}

async function main(): Promise<void> {
  Logger.info('Credential encryption backfill started');
  createDatabasePool(env);

  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    Logger.error('Database connection failed; aborting backfill');
    process.exit(1);
  }

  try {
    await backfillTable({
      table: 'subscriptions',
      idColumn: 'id',
      valueColumn: 'credentials_encrypted',
    });

    const hasSelectionTable = await tableExists(
      'subscription_upgrade_selections'
    );
    if (hasSelectionTable) {
      await backfillTable({
        table: 'subscription_upgrade_selections',
        idColumn: 'subscription_id',
        valueColumn: 'credentials_encrypted',
      });
    }
  } catch (error) {
    Logger.error('Credential backfill failed', { error });
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }

  Logger.info('Credential encryption backfill finished');
}

main().catch(error => {
  Logger.error('Unhandled credential backfill error', { error });
  process.exit(1);
});
