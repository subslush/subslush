import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/environment';
import { EncryptedSessionData } from '../types/session';
import { Logger } from './logger';

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
