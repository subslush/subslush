import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatusResponse,
  PaymentEstimate,
  Currency,
  CheckoutRequest,
  CheckoutResponse,
  MinDepositResponse,
  PaymentQuoteRequest,
  PaymentQuoteResponse
} from '$lib/types/payment.js';
import { unwrapApiData } from './response.js';
import { storage, STORAGE_KEYS } from '$lib/utils/storage.js';

const CURRENCY_CACHE_KEY = STORAGE_KEYS.PAYMENT_CURRENCIES;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const pickString = (...values: unknown[]): string | undefined =>
  values.find(value => typeof value === 'string') as string | undefined;

const NETWORK_SUFFIXES: Array<{ suffix: string; label: string }> = [
  { suffix: 'trc20', label: 'TRC20' },
  { suffix: 'erc20', label: 'ERC20' },
  { suffix: 'bep20', label: 'BEP20' },
  { suffix: 'bep2', label: 'BEP2' },
  { suffix: 'bsc', label: 'BSC' },
  { suffix: 'arbitrum', label: 'Arbitrum' },
  { suffix: 'arb', label: 'Arbitrum' },
  { suffix: 'optimism', label: 'Optimism' },
  { suffix: 'op', label: 'Optimism' },
  { suffix: 'polygon', label: 'Polygon' },
  { suffix: 'matic', label: 'Polygon' },
  { suffix: 'solana', label: 'Solana' },
  { suffix: 'sol', label: 'Solana' },
  { suffix: 'avaxc', label: 'Avalanche C-Chain' },
  { suffix: 'avax', label: 'Avalanche' },
  { suffix: 'base', label: 'Base' },
  { suffix: 'celo', label: 'Celo' },
  { suffix: 'ton', label: 'TON' },
  { suffix: 'algo', label: 'Algorand' },
  { suffix: 'near', label: 'Near' },
];
const NETWORK_SUFFIXES_SORTED = [...NETWORK_SUFFIXES].sort(
  (a, b) => b.suffix.length - a.suffix.length
);
const KNOWN_NETWORK_BASES = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'usdr']);

const resolveNetworkInfo = (
  code: string,
  codeSet: Set<string>
): { baseCode: string; networkCode: string; networkLabel: string } => {
  for (const network of NETWORK_SUFFIXES_SORTED) {
    if (code.endsWith(network.suffix)) {
      const baseCode = code.slice(0, -network.suffix.length);
      if (baseCode && (codeSet.has(baseCode) || KNOWN_NETWORK_BASES.has(baseCode))) {
        return {
          baseCode,
          networkCode: network.suffix,
          networkLabel: network.label
        };
      }
    }
  }

  return { baseCode: code, networkCode: 'native', networkLabel: 'Native' };
};

const readCurrencyCache = (): Currency[] | null => {
  const cached = storage.get(CURRENCY_CACHE_KEY);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed)) {
      return parsed as Currency[];
    }
    if (isRecord(parsed) && Array.isArray(parsed.currencies)) {
      return parsed.currencies as Currency[];
    }
  } catch (error) {
    console.warn('[PAYMENTS API] Failed to parse cached currencies:', error);
  }
  storage.remove(CURRENCY_CACHE_KEY);
  return null;
};

const writeCurrencyCache = (currencies: Currency[]): void => {
  storage.set(
    CURRENCY_CACHE_KEY,
    JSON.stringify({ cachedAt: Date.now(), currencies })
  );
};

export class PaymentService {
  async debugCurrenciesResponse(): Promise<Record<string, unknown>> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.CURRENCIES);
      return {
        rawResponse: response,
        dataType: typeof response.data,
        isArray: Array.isArray(response.data),
        hasDataProperty: 'data' in response,
        hasCurrenciesProperty: isRecord(response.data) && 'currencies' in response.data,
        keys: isRecord(response.data) ? Object.keys(response.data) : []
      };
    } catch (error) {
      console.error('[DEBUG] Error in debugCurrenciesResponse:', error);
      throw error;
    }
  }
  async getSupportedCurrencies(): Promise<Currency[]> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.CURRENCIES);

      console.log('[PAYMENTS API] Raw response:', response);
      console.log('[PAYMENTS API] response.data:', response.data);
      console.log('[PAYMENTS API] response.data type:', typeof response.data);
      console.log('[PAYMENTS API] response.data is array:', Array.isArray(response.data));

      // Handle multiple possible response structures
      let currencyArray: unknown[] = [];

      // Case 1: Direct array in response.data
      if (Array.isArray(response.data)) {
        currencyArray = response.data;
        console.log('[PAYMENTS API] Case 1: Direct array in response.data');
      }
      else if (isRecord(response.data)) {
        const dataValue = response.data.data;

        // Case 2: Wrapped in data.data.currencies (double wrapping)
        if (isRecord(dataValue) && Array.isArray(dataValue.currencies)) {
          currencyArray = dataValue.currencies;
          console.log('[PAYMENTS API] Case 2: Double wrapped in data.data.currencies');
        }
        // Case 3: Wrapped in data.currencies
        else if (Array.isArray(response.data.currencies)) {
          currencyArray = response.data.currencies;
          console.log('[PAYMENTS API] Case 3: Wrapped in data.currencies');
        }
        // Case 4: Just data.data (single array)
        else if (Array.isArray(dataValue)) {
          currencyArray = dataValue;
          console.log('[PAYMENTS API] Case 4: Single array in data.data');
        }
        // Case 5: Response structure inspection
        else {
          console.log('[PAYMENTS API] Unknown structure, inspecting...');
          console.log('[PAYMENTS API] response keys:', Object.keys(response));
          console.log('[PAYMENTS API] response.data keys:', Object.keys(response.data));

          // Try to find any array in the response
          const findArrayInObject = (obj: unknown, path = ''): unknown[] | null => {
            if (Array.isArray(obj)) {
              console.log(`[PAYMENTS API] Found array at path: ${path}`);
              return obj;
            }
            if (isRecord(obj)) {
              for (const [key, value] of Object.entries(obj)) {
                const result = findArrayInObject(value, path ? `${path}.${key}` : key);
                if (result) return result;
              }
            }
            return null;
          };

          const foundArray = findArrayInObject(response);
          if (foundArray) {
            currencyArray = foundArray;
            console.log('[PAYMENTS API] Case 5: Found array via deep search');
          }
        }
      }

      console.log('[PAYMENTS API] Extracted currencies count:', currencyArray.length);
      console.log('[PAYMENTS API] First 10 raw currencies:', currencyArray.slice(0, 10));

      if (currencyArray.length === 0) {
        throw new Error('No currencies returned from API');
      }

      // Normalize currencies to Currency objects
      const normalizedCurrencies: Currency[] = currencyArray.map((currency, index) => {
        // If it's already a string, convert to object
        if (typeof currency === 'string') {
          return {
            code: currency.toLowerCase(),
            name: currency.toUpperCase(),
            baseCode: undefined,
            networkCode: undefined,
            network: undefined,
            fullName: currency.toUpperCase()
          };
        }

        // If it's an object, extract the relevant fields
        if (isRecord(currency)) {
          const rawCode = pickString(
            currency.code,
            currency.ticker,
            currency.symbol,
            `currency-${index}`
          )!;
          const code = rawCode.toLowerCase();
          const name = pickString(
            currency.name,
            currency.displayName,
            currency.code,
            currency.ticker,
            currency.symbol,
            `Currency ${index}`
          )!;
          const network = pickString(currency.network, currency.networkLabel, currency.blockchain);
          const baseCode = pickString(
            currency.baseTicker,
            currency.base_code,
            currency.base,
            currency.coin,
            currency.symbol_base
          );
          const networkCode = pickString(
            currency.networkCode,
            currency.network_code
          );
          const fullName = pickString(
            currency.fullName,
            currency.displayName,
            currency.name,
            currency.code,
            `Currency ${index}`
          )!;
          const image = pickString(currency.image, currency.iconUrl);
          const isStable =
            typeof currency.isStable === 'boolean'
              ? currency.isStable
              : typeof currency.is_stable === 'boolean'
              ? currency.is_stable
              : undefined;
          const isPopular =
            typeof currency.isPopular === 'boolean'
              ? currency.isPopular
              : typeof currency.is_popular === 'boolean'
              ? currency.is_popular
              : undefined;

          return {
            code,
            name,
            baseCode: baseCode ? baseCode.toLowerCase() : undefined,
            networkCode: networkCode ? networkCode.toLowerCase() : undefined,
            network,
            fullName,
            image,
            isStable,
            isPopular
          };
        }

        // Fallback for unexpected types
        console.warn('[PAYMENTS API] Unexpected currency type:', typeof currency, currency);
        return {
          code: `currency-${index}`,
          name: `Currency ${index}`,
          network: undefined,
          fullName: `Currency ${index}`
        };
      });

      const codeSet = new Set(normalizedCurrencies.map(currency => currency.code));
      const enrichedCurrencies = normalizedCurrencies.map(currency => {
        if (currency.baseCode) {
          const isNative = currency.baseCode === currency.code;
          return {
            ...currency,
            network: currency.network || (isNative ? 'Native' : undefined),
            networkCode: currency.networkCode || (isNative ? 'native' : undefined)
          };
        }

        const networkInfo = resolveNetworkInfo(currency.code, codeSet);
        return {
          ...currency,
          baseCode: networkInfo.baseCode,
          networkCode: networkInfo.networkCode,
          network: currency.network || networkInfo.networkLabel
        };
      });

      console.log('[PAYMENTS API] Normalized currencies count:', enrichedCurrencies.length);
      console.log('[PAYMENTS API] First 10 normalized currencies:', enrichedCurrencies.slice(0, 10));

      writeCurrencyCache(enrichedCurrencies);
      return enrichedCurrencies;
    } catch (error) {
      console.error('[PAYMENTS API] Error fetching currencies:', error);
      const cachedCurrencies = readCurrencyCache();
      if (cachedCurrencies && cachedCurrencies.length > 0) {
        console.warn('[PAYMENTS API] Using cached currencies after fetch failure');
        return cachedCurrencies;
      }
      throw new Error('Failed to load supported currencies');
    }
  }

  async getEstimate(creditAmount: number, currency: string): Promise<PaymentEstimate> {
    const targetCurrency = currency.toLowerCase();
    const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.ESTIMATE, {
      params: {
        amount: creditAmount,
        currency_from: 'usd',
        currency_to: targetCurrency
      }
    });
    const payload = unwrapApiData<{ estimatedAmount: number; currency: string }>(response);
    return {
      estimatedAmount: payload.estimatedAmount,
      currency: payload.currency || targetCurrency.toUpperCase()
    };
  }

  async getMinimumDeposit(currency: string): Promise<MinDepositResponse> {
    const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.MIN_AMOUNT, {
      params: {
        currency: currency.toLowerCase()
      }
    });
    return unwrapApiData<MinDepositResponse>(response);
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.CREATE, request);
    return unwrapApiData<CreatePaymentResponse>(response);
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const response = await apiClient.get(`${API_ENDPOINTS.PAYMENTS.STATUS}/${paymentId}`);
    return unwrapApiData<PaymentStatusResponse>(response);
  }

  async getPaymentHistory(limit: number = 20, offset: number = 0): Promise<Record<string, unknown>[]> {
    try {
      console.log('[PAYMENTS API] Making request to:', API_ENDPOINTS.PAYMENTS.HISTORY);
      console.log('[PAYMENTS API] Request params:', { limit, offset });

      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.HISTORY, {
        params: { limit, offset }
      });

      console.log('[PAYMENTS API] Raw response:', response);
      console.log('[PAYMENTS API] Response data:', response.data);
      console.log('[PAYMENTS API] Response data type:', typeof response.data);
      console.log('[PAYMENTS API] Response data keys:', isRecord(response.data) ? Object.keys(response.data) : []);

      if (isRecord(response.data)) {
        const dataValue = response.data.data;
        if (isRecord(dataValue)) {
          console.log('[PAYMENTS API] Found response.data.data:', dataValue);
          console.log('[PAYMENTS API] response.data.data keys:', Object.keys(dataValue));
          const transactions = dataValue.transactions;
          if (Array.isArray(transactions)) {
            console.log('[PAYMENTS API] Found transactions in response.data.data.transactions:', transactions);
            return transactions as Record<string, unknown>[];
          }
        }

        if (Array.isArray(response.data.transactions)) {
          console.log('[PAYMENTS API] Found transactions in response.data.transactions:', response.data.transactions);
          return response.data.transactions as Record<string, unknown>[];
        }
      }

      console.log('[PAYMENTS API] No transactions found, returning empty array');
      return [];
    } catch (error) {
      console.error('[PAYMENTS API] Error in getPaymentHistory:', error);
      throw error;
    }
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.CHECKOUT, request);
    return unwrapApiData<CheckoutResponse>(response);
  }

  async getQuote(data: PaymentQuoteRequest): Promise<PaymentQuoteResponse> {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.QUOTE, data);
    return unwrapApiData<PaymentQuoteResponse>(response);
  }
}

export const paymentService = new PaymentService();
