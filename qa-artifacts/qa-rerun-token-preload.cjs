const fs = require('node:fs/promises');
const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const originalReadFile = fs.readFile.bind(fs);
fs.readFile = async (path, ...args) => {
  if (String(path).endsWith('/admin-token.txt')) {
    return jwt.sign(
      {
        userId: '9bb2e6c4-2d0d-4b83-804e-1af8d4aeb324',
        email: 'qa-r3-admin@local.test',
        role: 'admin',
      },
      process.env.JWT_SECRET,
      {
        algorithm: process.env.JWT_ALGORITHM || 'HS256',
        expiresIn: '30m',
        issuer: 'subscription-platform',
        audience: 'subscription-platform-users',
      }
    );
  }
  return originalReadFile(path, ...args);
};
