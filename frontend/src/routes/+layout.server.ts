import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, cookies }) => {
  try {
    console.log('🔐 [LAYOUT SERVER] Loading user session...');

    // Fetch user session from backend (cookies automatically included)
    const response = await fetch('http://localhost:3001/api/v1/auth/sessions', {
      credentials: 'include',
      headers: {
        // Forward cookies from the request
        'Cookie': cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ')
      }
    });

    if (!response.ok) {
      console.warn('⚠️ [LAYOUT SERVER] No active session:', response.status);
      return { user: null };
    }

    const data = await response.json();
    console.log('✅ [LAYOUT SERVER] User session loaded:', data.user?.email);

    return {
      user: data.user || null,
    };
  } catch (error) {
    console.error('❌ [LAYOUT SERVER] Failed to load session:', error);
    return { user: null };
  }
};