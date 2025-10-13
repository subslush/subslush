import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, cookies }) => {
  try {
    console.log('🔐 [LAYOUT SERVER] Loading user session...');

    // Get the auth token from cookies
    const authToken = cookies.get('auth_token');

    if (!authToken) {
      console.log('⚠️ [LAYOUT SERVER] No auth token in cookies');
      return { user: null };
    }

    console.log('🍪 [LAYOUT SERVER] Auth token found:', authToken.substring(0, 20) + '...');

    // Make request to backend with cookie in header
    // SvelteKit's fetch automatically forwards cookies, but we'll be explicit
    const response = await fetch('http://localhost:3001/api/v1/users/profile', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('🔐 [LAYOUT SERVER] Session response status:', response.status);

    if (!response.ok) {
      console.warn('⚠️ [LAYOUT SERVER] No active session:', response.status);
      return { user: null };
    }

    const data = await response.json();
    console.log('✅ [LAYOUT SERVER] User profile loaded:', data.data?.profile?.email);

    return {
      user: data.data?.profile || null,
    };
  } catch (error) {
    console.error('❌ [LAYOUT SERVER] Failed to load session:', error);
    return { user: null };
  }
};