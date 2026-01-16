import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/environment';
import { EncryptedSessionData } from '../types/session';
import { Logger } from './logger';

export interface EncryptedCredentialsPayloadV1 {
  version: 1;
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface CredentialsDecryptResult {
  plaintext: string;
  wasEncrypted: boolean;
  migratedPayload?: string;
}

class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly ivLength: number;

  constructor() {
    this.key = Buffer.from(env.SESSION_ENCRYPTION_KEY, 'utf8');
    this.ivLength = env.SESSION_IV_LENGTH;
  }

  encrypt(data: string): EncryptedSessionData {
    try {
      const iv = randomBytes(this.ivLength);
      const cipher = createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      Logger.error('Error encrypting data:', error);
      throw new Error('Failed to encrypt session data');
    }
  }

  decrypt(encryptedData: EncryptedSessionData): string {
    try {
      const { encryptedData: data, iv, tag } = encryptedData;

      const decipher = createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      Logger.error('Error decrypting data:', error);
      throw new Error('Failed to decrypt session data');
    }
  }

  encryptObject<T>(obj: T): EncryptedSessionData {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  decryptObject<T>(encryptedData: EncryptedSessionData): T {
    const jsonString = this.decrypt(encryptedData);
    return JSON.parse(jsonString) as T;
  }

  isValidEncryptedData(data: any): data is EncryptedSessionData {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.encryptedData === 'string' &&
      typeof data.iv === 'string' &&
      typeof data.tag === 'string'
    );
  }
}

export const encryptionService = new EncryptionService();
export default encryptionService;

class CredentialsEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly ivLength: number;

  constructor() {
    this.key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'utf8');
    this.ivLength = env.CREDENTIALS_IV_LENGTH;
  }

  private parsePayload(value: string): EncryptedCredentialsPayloadV1 | null {
    try {
      const parsed = JSON.parse(value);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        parsed.version !== 1 ||
        typeof parsed.ciphertext !== 'string' ||
        typeof parsed.iv !== 'string' ||
        typeof parsed.tag !== 'string'
      ) {
        return null;
      }
      return parsed as EncryptedCredentialsPayloadV1;
    } catch {
      return null;
    }
  }

  isEncryptedPayload(value: string): boolean {
    return this.parsePayload(value) !== null;
  }

  encryptPayload(data: string): EncryptedCredentialsPayloadV1 {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      version: 1,
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  encryptToString(data: string): string {
    const payload = this.encryptPayload(data);
    return JSON.stringify(payload);
  }

  decryptPayload(payload: EncryptedCredentialsPayloadV1): string {
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(payload.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  decryptFromString(value: string): CredentialsDecryptResult {
    const parsed = this.parsePayload(value);
    if (!parsed) {
      return {
        plaintext: value,
        wasEncrypted: false,
        migratedPayload: this.encryptToString(value),
      };
    }

    return {
      plaintext: this.decryptPayload(parsed),
      wasEncrypted: true,
    };
  }

  prepareForStorage(value: string | null): string | null {
    if (value === null) {
      return null;
    }
    if (this.isEncryptedPayload(value)) {
      return value;
    }
    return this.encryptToString(value);
  }
}

export const credentialsEncryptionService = new CredentialsEncryptionService();
