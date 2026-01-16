#!/usr/bin/env node

// Test script to verify the API routing fix (no axios dependency)

const API_CONFIG = {
  BASE_URL: '/api/v1'
};

const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login'
  }
};

const BASE_HOST = 'http://localhost:3001';

async function testApiRouting() {
  console.log('🧪 Testing API Routing Fix...\n');

  console.log('📋 Configuration:');
  console.log(`   BASE_URL: ${API_CONFIG.BASE_URL}`);
  console.log(`   LOGIN endpoint: ${API_ENDPOINTS.AUTH.LOGIN}`);
  console.log(`   Expected final URL: ${BASE_HOST}${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.LOGIN}\n`);

  try {
    console.log('🌐 Making request...');

    const response = await fetch(
      `${BASE_HOST}${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.LOGIN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'testpass'
        })
      }
    );

    const responseBody = await response.json().catch(() => null);

    if (response.status === 401) {
      console.log('\n🎉 Perfect! The route was found but credentials are invalid (expected)');
      console.log(`   Status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(responseBody)}`);
      console.log('   ✅ API routing fix is working correctly!');
      console.log('   ❌ Old behavior: POST /api/v1/api/auth/login → 404 Not Found');
      console.log('   ✅ New behavior: POST /api/v1/auth/login → 401 Unauthorized (route found!)');
      return;
    }

    if (response.status === 404) {
      console.log('\n❌ FAILED! Route not found - the double /api prefix issue still exists');
      console.log(`   Status: ${response.status}`);
      console.log(`   Response: ${JSON.stringify(responseBody)}`);
      return;
    }

    if (response.ok) {
      console.log('\n✅ Success! API routing is working correctly');
      console.log(`   Status: ${response.status}`);
      return;
    }

    console.log('\n⚠️  Unexpected response');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(responseBody)}`);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ECONNREFUSED') {
      console.log('\n❌ Backend server is not running on port 3001');
      console.log('   Please start the backend server first: npm run dev');
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.log('\n❌ Network error:', message);
  }
}

testApiRouting();
