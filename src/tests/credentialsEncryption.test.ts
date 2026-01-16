import { describe, expect, it } from '@jest/globals';
import { credentialsEncryptionService } from '../utils/encryption';

describe('CredentialsEncryptionService', () => {
  it('encrypts and decrypts payloads', () => {
    const secret = 'user@example.com:password123';
    const encrypted = credentialsEncryptionService.encryptToString(secret);

    expect(encrypted).not.toEqual(secret);

    const decrypted = credentialsEncryptionService.decryptFromString(encrypted);
    expect(decrypted.wasEncrypted).toBe(true);
    expect(decrypted.plaintext).toBe(secret);
    expect(decrypted.migratedPayload).toBeUndefined();
  });

  it('flags plaintext and provides a migrated payload', () => {
    const plaintext = 'plain-credentials';
    const result = credentialsEncryptionService.decryptFromString(plaintext);

    expect(result.wasEncrypted).toBe(false);
    expect(result.plaintext).toBe(plaintext);
    expect(result.migratedPayload).toBeTruthy();

    const migrated = credentialsEncryptionService.decryptFromString(
      result.migratedPayload as string
    );
    expect(migrated.wasEncrypted).toBe(true);
    expect(migrated.plaintext).toBe(plaintext);
  });

  it('prepareForStorage encrypts plaintext and preserves encrypted payloads', () => {
    const plaintext = 'account:secret';
    const stored = credentialsEncryptionService.prepareForStorage(plaintext);
    expect(stored).toBeTruthy();
    expect(stored).not.toEqual(plaintext);

    const storedAgain = credentialsEncryptionService.prepareForStorage(
      stored as string
    );
    expect(storedAgain).toEqual(stored);
  });
});
