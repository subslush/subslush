#!/usr/bin/env node

/**
 * End-to-end smoke test for the session-based auth flow.
 * Verifies register/login, profile access, and credit balance using cookies.
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const API_PREFIX = '/api/v1';

const TEST_EMAIL =
  process.env.TEST_EMAIL || `test-${Date.now()}@example.com`;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123!';
const TEST_FIRST_NAME = process.env.TEST_FIRST_NAME || 'Flow';
const TEST_LAST_NAME = process.env.TEST_LAST_NAME || 'Tester';

const cookieJar = new Map();

const updateCookies = (setCookieHeaders) => {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders];
  headers.forEach((header) => {
    const [cookiePair] = header.split(';');
    if (!cookiePair) return;
    const [name, value] = cookiePair.split('=');
    if (name && value) {
      cookieJar.set(name, value);
    }
  });
};

const getCookieHeader = () =>
  Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const getCsrfToken = () => cookieJar.get('csrf_token');

const request = (method, path, body) => {
  const url = new URL(path, BASE_URL);
  const transport = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  const headers = {
    'User-Agent': 'Test-Frontend-Flow/1.0',
  };

  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  const csrfToken = getCsrfToken();
  if (payload && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const cookieHeader = getCookieHeader();
  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  const options = {
    method,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        updateCookies(res.headers['set-cookie']);

        const contentType = res.headers['content-type'] || '';
        let parsed = data;
        if (contentType.includes('application/json')) {
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = data;
          }
        }

        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
};

const logSection = (title) => {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
};

const healthCheck = async () => {
  logSection('1) Health check');
  const response = await request('GET', '/health');
  if (response.statusCode !== 200) {
    throw new Error(`Health check failed (${response.statusCode})`);
  }
  console.log('OK: Server is healthy');
};

const registerUser = async () => {
  logSection('2) Registration');
  const response = await request('POST', `${API_PREFIX}/auth/register`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    firstName: TEST_FIRST_NAME,
    lastName: TEST_LAST_NAME,
  });

  if (response.statusCode === 201) {
    console.log('OK: Registration succeeded');
    return response.body?.user || null;
  }

  console.log(
    `INFO: Registration failed (${response.statusCode}); falling back to login`
  );
  return null;
};

const loginUser = async () => {
  logSection('3) Login');
  const response = await request('POST', `${API_PREFIX}/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (response.statusCode === 200 || response.statusCode === 201) {
    console.log('OK: Login succeeded');
    return response.body?.user || null;
  }

  throw new Error(`Login failed (${response.statusCode})`);
};

const fetchProfile = async () => {
  logSection('4) Profile');
  const response = await request('GET', `${API_PREFIX}/auth/profile`);

  if (response.statusCode !== 200) {
    throw new Error(`Profile fetch failed (${response.statusCode})`);
  }

  const profile = response.body?.user;
  if (!profile?.id) {
    throw new Error('Profile response missing user data');
  }

  console.log(`OK: Profile loaded for ${profile.email}`);
  return profile;
};

const fetchBalance = async (userId) => {
  logSection('5) Credits balance');
  const response = await request(
    'GET',
    `${API_PREFIX}/credits/balance/${userId}`
  );

  if (response.statusCode !== 200) {
    throw new Error(`Balance fetch failed (${response.statusCode})`);
  }

  console.log(`OK: Balance: $${response.body?.balance ?? '0.00'}`);
};

async function run() {
  console.log('Frontend flow smoke test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test user: ${TEST_EMAIL}`);

  await healthCheck();

  const registeredUser = await registerUser();
  const loggedInUser = await loginUser();
  const profile = await fetchProfile();

  const userId = profile?.id || loggedInUser?.id || registeredUser?.id;
  if (!userId) {
    throw new Error('Unable to determine userId for balance lookup');
  }

  await fetchBalance(userId);

  console.log('\nFlow complete: auth + profile + balance verified');
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nERROR: Flow failed: ${message}`);
  process.exit(1);
});
