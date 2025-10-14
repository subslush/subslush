/**
 * Test script to verify the complete authentication data flow works correctly
 */

const BASE_URL = 'http://localhost:3001/api/v1';

async function testCompleteFlow() {
  console.log('🧪 Testing complete authentication and data flow...\n');

  try {
    // Step 1: Login
    console.log('1️⃣ Testing login...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Script/1.0'
      },
      body: JSON.stringify({
        email: 'johnny.test@example.com',
        password: 'testpass123'
      }),
      credentials: 'include'
    });

    const loginData = await loginResponse.json();
    console.log('✅ Login Response:', JSON.stringify(loginData, null, 2));

    if (!loginData.user?.firstName) {
      console.error('❌ FAIL: Login response missing firstName');
      return false;
    }

    // Extract cookie from headers
    const cookieHeader = loginResponse.headers.get('set-cookie');
    console.log('🍪 Cookie header:', cookieHeader);

    // Step 2: Test Profile Endpoint
    console.log('\n2️⃣ Testing profile endpoint...');
    const profileResponse = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader || '',
        'User-Agent': 'Test-Script/1.0'
      }
    });

    const profileData = await profileResponse.json();
    console.log('✅ Profile Response:', JSON.stringify(profileData, null, 2));

    if (!profileData.user?.firstName) {
      console.error('❌ FAIL: Profile response missing firstName');
      return false;
    }

    // Step 3: Test Balance Endpoint
    console.log('\n3️⃣ Testing balance endpoint...');
    const balanceResponse = await fetch(`${BASE_URL}/credits/balance/${loginData.user.id}`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader || '',
        'User-Agent': 'Test-Script/1.0'
      }
    });

    const balanceData = await balanceResponse.json();
    console.log('✅ Balance Response:', JSON.stringify(balanceData, null, 2));

    if (typeof balanceData.balance !== 'number') {
      console.error('❌ FAIL: Balance response should have numeric balance field');
      return false;
    }

    // Step 4: Summary
    console.log('\n🎉 COMPLETE FLOW TEST RESULTS:');
    console.log(`👤 User: ${profileData.user.firstName} ${profileData.user.lastName}`);
    console.log(`📧 Email: ${profileData.user.email}`);
    console.log(`💰 Balance: $${balanceData.balance.toFixed(2)}`);
    console.log(`🆔 User ID: ${profileData.user.id}`);
    console.log('✅ ALL BACKEND APIs WORKING CORRECTLY!');

    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testCompleteFlow().then(success => {
  if (success) {
    console.log('\n🚀 Backend is ready for frontend integration');
    console.log('🔧 If browser still shows old data, clear browser cache and cookies');
  } else {
    console.log('\n💥 Backend has issues that need fixing');
  }
});