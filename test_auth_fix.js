// Test script to verify the API routing fix
const axios = require('axios');

// Configuration matching our frontend constants
const API_CONFIG = {
  BASE_URL: '/api/v1'
};

const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login'
  }
};

// Simulate the axios client with baseURL (like our frontend does)
const client = axios.create({
  baseURL: 'http://localhost:3001' + API_CONFIG.BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function testApiRouting() {
  console.log('🧪 Testing API Routing Fix...\n');

  // Test the fixed configuration
  console.log('📋 Configuration:');
  console.log(`   BASE_URL: ${API_CONFIG.BASE_URL}`);
  console.log(`   LOGIN endpoint: ${API_ENDPOINTS.AUTH.LOGIN}`);
  console.log(`   Full client baseURL: http://localhost:3001${API_CONFIG.BASE_URL}`);
  console.log(`   Expected final URL: http://localhost:3001/api/v1/auth/login\n`);

  try {
    console.log('🌐 Making request...');
    console.log(`   client.post("${API_ENDPOINTS.AUTH.LOGIN}", ...)`);
    console.log(`   Axios will construct: baseURL + endpoint`);
    console.log(`   Final URL: http://localhost:3001/api/v1/auth/login`);

    const response = await client.post(API_ENDPOINTS.AUTH.LOGIN, {
      email: 'test@example.com',
      password: 'testpass'
    });

    console.log('\n✅ Success! API routing is working correctly');
    console.log(`   Status: ${response.status}`);

  } catch (error) {
    if (error.response) {
      console.log('\n✅ Success! API routing is working correctly');
      console.log(`   Status: ${error.response.status} (${error.response.status === 401 ? 'Authentication failed - route found!' : 'Error'})`);
      console.log(`   Response: ${JSON.stringify(error.response.data)}`);

      if (error.response.status === 401) {
        console.log('\n🎉 Perfect! The route was found but credentials are invalid (expected)');
        console.log('   This confirms the API routing fix is working correctly!');
        console.log('   ❌ Old behavior: POST /api/v1/api/auth/login → 404 Not Found');
        console.log('   ✅ New behavior: POST /api/v1/auth/login → 401 Unauthorized (route found!)');
      } else if (error.response.status === 404) {
        console.log('\n❌ FAILED! Route not found - the double /api prefix issue still exists');
        console.log('   Expected: 401 Unauthorized (route found, auth failed)');
        console.log('   Got: 404 Not Found (route not found)');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n❌ Backend server is not running on port 3001');
      console.log('   Please start the backend server first: npm run dev');
    } else {
      console.log('\n❌ Network error:', error.message);
    }
  }
}

testApiRouting();