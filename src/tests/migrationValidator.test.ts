import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MigrationRunner = require('../../database/migrate.js');

describe('migration validator legacy cutoff', () => {
  let tempDir: string;
  let exitSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-validator-'));
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const runnerForTempDir = () => {
    const runner = new MigrationRunner();
    runner.migrationsDir = tempDir;
    return runner;
  };

  it('grandfathers migrations dated through 2026-07-09 without failing validation', async () => {
    fs.writeFileSync(
      path.join(tempDir, '20260709_120000_legacy_without_down.sql'),
      'CREATE TABLE legacy_example (id UUID PRIMARY KEY);'
    );

    await expect(
      runnerForTempDir().validateMigrations()
    ).resolves.toBeUndefined();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Legacy migration grandfathered')
    );
  });

  it('fails new migrations after 2026-07-09 when DOWN migration is missing', async () => {
    fs.writeFileSync(
      path.join(tempDir, '20260710_000000_missing_down.sql'),
      `-- Up Migration
BEGIN;
CREATE TABLE strict_example (id UUID PRIMARY KEY);
COMMIT;
`
    );

    await expect(runnerForTempDir().validateMigrations()).rejects.toThrow(
      'process.exit:1'
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No DOWN migration found')
    );
  });
});
