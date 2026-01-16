import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { creditsService } from '$lib/api/credits.js';
import type { CreditBalance } from '$lib/types/credits.js';

interface CreditsState {
  userId: string | null;
  balance: number | null;
  availableBalance: number | null;
  pendingBalance: number | null;
  lastUpdated: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: CreditsState = {
  userId: null,
  balance: null,
  availableBalance: null,
  pendingBalance: null,
  lastUpdated: null,
  isLoading: false,
  error: null
};

const resolveBalanceValue = (payload: CreditBalance): number => {
  if (payload.availableBalance !== undefined && payload.availableBalance !== null) {
    return payload.availableBalance;
  }
  if (payload.balance !== undefined && payload.balance !== null) {
    return payload.balance;
  }
  return 0;
};

function createCreditsStore() {
  const { subscribe, set, update } = writable<CreditsState>(initialState);
  let inflight: Promise<void> | null = null;

  const setFromBalance = (payload: CreditBalance, userId?: string | null) => {
    update(state => ({
      ...state,
      userId: userId ?? state.userId ?? payload.userId ?? null,
      balance: resolveBalanceValue(payload),
      availableBalance: payload.availableBalance ?? payload.balance ?? null,
      pendingBalance: payload.pendingBalance ?? null,
      lastUpdated: payload.lastUpdated ?? new Date().toISOString(),
      error: null,
      isLoading: false
    }));
  };

  const refresh = async (
    userId?: string | null,
    options: { force?: boolean } = {}
  ) => {
    if (!browser) return;
    const state = get({ subscribe });
    const resolvedUserId = userId ?? state.userId;
    if (!resolvedUserId) return;

    if (inflight && !options.force) {
      await inflight;
      return;
    }

    inflight = (async () => {
      update(current => ({
        ...current,
        userId: resolvedUserId,
        isLoading: true,
        error: null
      }));

      try {
        const balance = await creditsService.getBalance(resolvedUserId);
        setFromBalance(balance, resolvedUserId);
      } catch (error) {
        console.warn('Failed to refresh credits balance:', error);
        update(current => ({
          ...current,
          isLoading: false,
          error: 'Unable to load credits'
        }));
      }
    })();

    try {
      await inflight;
    } finally {
      inflight = null;
    }
  };

  const init = (userId?: string | null) => {
    const state = get({ subscribe });
    const resolvedUserId = userId ?? null;

    if (!resolvedUserId) {
      set(initialState);
      return;
    }

    if (state.userId !== resolvedUserId) {
      set({
        ...initialState,
        userId: resolvedUserId
      });
    }

    if (state.userId === resolvedUserId && state.balance !== null) {
      return;
    }

    void refresh(resolvedUserId, { force: true });
  };

  const setBalance = (balance: number, userId?: string | null) => {
    update(state => ({
      ...state,
      userId: userId ?? state.userId,
      balance,
      availableBalance: balance,
      lastUpdated: new Date().toISOString(),
      error: null
    }));
  };

  const clear = () => set(initialState);

  return {
    subscribe,
    init,
    refresh,
    setBalance,
    setFromBalance,
    clear
  };
}

export const credits = createCreditsStore();
