import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PIN_REGEX = /^\d{4}$/;
const PIN_HASH_ALGORITHM = 'scrypt';
const PIN_SALT_BYTES = 16;
const PIN_KEY_LENGTH = 64;

export const isValidPin = (pin: string): boolean => PIN_REGEX.test(pin);

export const hashPin = (pin: string): string => {
  if (!isValidPin(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }

  const salt = randomBytes(PIN_SALT_BYTES).toString('hex');
  const hash = scryptSync(pin, salt, PIN_KEY_LENGTH).toString('hex');

  return `${PIN_HASH_ALGORITHM}$${salt}$${hash}`;
};

export const verifyPin = (pin: string, storedHash: string): boolean => {
  if (!isValidPin(pin)) {
    return false;
  }

  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== PIN_HASH_ALGORITHM || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(pin, salt, PIN_KEY_LENGTH).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, derivedBuffer);
};
