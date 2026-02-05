<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { X, CreditCard, Copy, Check, AlertCircle, Loader2, Clock, ChevronDown, Search } from 'lucide-svelte';
  import { paymentService } from '$lib/api/payments.js';
  import {
    trackTikTokAddPaymentInfo,
    trackTikTokInitiateCheckout,
    trackTikTokPurchase
  } from '$lib/utils/analytics.js';
  import type {
    CreatePaymentResponse,
    PaymentStatus,
    Currency,
    ResumablePayment
  } from '$lib/types/payment.js';
  import QRCode from 'qrcode';

  export let isOpen: boolean = false;
  export let userBalance: number = 0;
  export let onSuccess: (newBalance: number) => void;
  export let onPaymentCreated: ((payment: CreatePaymentResponse) => void) | null = null;
  export let resumePayment: ResumablePayment | null = null;

  let currentStep = 1;
  let customAmountInput = '';
  type CoinOption = {
    code: string;
    name: string;
    image?: string;
    isStable?: boolean;
    isPopular?: boolean;
  };
  type MinDepositInfo = {
    currency: string;
    minAmount: number;
    minUsd: number;
    fiatEquivalent?: number;
  };

  let selectedCoin: string | null = null;
  let selectedCurrency: Currency | null = null;
  let currencies: Currency[] = [];
  let coinOptions: CoinOption[] = [];
  let networkOptions: Currency[] = [];
  let minDepositByCurrency: Record<string, MinDepositInfo> = {};
  const minDepositRequests = new Set<string>();
  let coinDropdownOpen = false;
  let networkDropdownOpen = false;
  let coinDropdownRef: HTMLDivElement | null = null;
  let coinTriggerRef: HTMLButtonElement | null = null;
  let networkDropdownRef: HTMLDivElement | null = null;
  let networkTriggerRef: HTMLButtonElement | null = null;
  let coinSearch = '';
  let paymentData: CreatePaymentResponse | null = null;
  let paymentLabels: { tokenLabel: string; networkLabel: string } | null = null;
  let paymentStatus: PaymentStatus = 'waiting';
  let qrCodeDataUrl = '';
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let addressCopied = false;
  let amountCopied = false;
  let isCurrencyLoading = false;
  let isCreatingPayment = false;
  let error = '';
  let expirationTime: Date | null = null;
  let timeRemaining = '';
  let resumedPaymentId: string | null = null;
  let lastTopupTrackingId = '';
  let lastTopupPurchaseTrackingId = '';

  const stableDefaultCodes = ['usdt', 'usdc'];
  const preferredCoinOrder = [
    'usdt',
    'usdc',
    'btc',
    'eth',
    'bnb',
    'sol',
    'xrp',
    'ada',
    'doge',
    'trx',
    'ton',
    'link',
    'dot',
    'matic',
    'avax',
    'ltc',
    'bch',
    'xlm',
    'atom',
    'etc',
    'xmr',
    'fil',
    'near',
    'algo'
  ];
  const preferredCoinRank = new Map(preferredCoinOrder.map((code, index) => [code, index]));
  const coinBaseAliases: Record<string, string> = {
    usdce: 'usdc'
  };
  const coinNameOverrides: Record<string, string> = {
    usdt: 'USDT',
    usdc: 'USD Coin'
  };
  const tokenSymbolOverrides: Record<string, string> = {
    usdce: 'USDC.e'
  };
  const networkSuffixes = [
    'tarc20',
    'arc20',
    'trc20',
    'erc20',
    'bep20',
    'bep2',
    'bsc',
    'arbitrum',
    'arb',
    'optimism',
    'op',
    'polygon',
    'matic',
    'solana',
    'sol',
    'avaxc',
    'avax',
    'base',
    'ton',
    'algo',
    'near',
    'omni'
  ];
  const networkLabels: Record<string, string> = {
    tarc20: 'TRC20',
    arc20: 'ARC20',
    trc20: 'TRC20',
    erc20: 'ERC20',
    bep20: 'BEP20',
    bep2: 'BEP2',
    bsc: 'BNB Smart Chain - BEP20',
    arbitrum: 'Arbitrum',
    arb: 'Arbitrum',
    optimism: 'Optimism',
    op: 'Optimism',
    polygon: 'Polygon',
    matic: 'Polygon',
    solana: 'Solana',
    sol: 'Solana',
    avaxc: 'Avalanche C-Chain',
    avax: 'Avalanche',
    base: 'Base',
    ton: 'TON',
    algo: 'Algorand',
    near: 'Near',
    omni: 'Omni'
  };
  const networkLabelsVerbose: Record<string, string> = {
    tarc20: 'TRON (TRC20)',
    arc20: 'ARC20',
    trc20: 'TRON (TRC20)',
    erc20: 'Ethereum (ERC20)',
    bep20: 'BNB Smart Chain (BEP20)',
    bep2: 'BNB Beacon Chain (BEP2)',
    bsc: 'BNB Smart Chain - BEP20',
    arbitrum: 'Arbitrum',
    arb: 'Arbitrum',
    optimism: 'Optimism',
    op: 'Optimism',
    polygon: 'Polygon',
    matic: 'Polygon',
    solana: 'Solana',
    sol: 'Solana',
    avaxc: 'Avalanche C-Chain',
    avax: 'Avalanche',
    base: 'Base',
    ton: 'TON',
    algo: 'Algorand',
    near: 'Near',
    omni: 'Omni',
    native: 'Native network'
  };
  const nativeNetworkNames: Record<string, string> = {
    btc: 'Bitcoin Mainnet',
    ltc: 'Litecoin Mainnet',
    xrp: 'Ripple Mainnet',
    sol: 'Solana Mainnet',
    trx: 'Tron Mainnet',
    bch: 'Bitcoin Cash Mainnet',
    ada: 'Cardano Mainnet',
    doge: 'Dogecoin Mainnet',
    xlm: 'Stellar Mainnet',
    xmr: 'Monero Mainnet',
    dot: 'Polkadot Mainnet',
    atom: 'Cosmos Hub',
    algo: 'Algorand Mainnet',
    near: 'Near Mainnet',
    avax: 'Avalanche Mainnet',
    ton: 'TON Mainnet',
    fil: 'Filecoin Mainnet',
    bnb: 'BNB Beacon Chain',
    eth: 'Ethereum Mainnet',
    matic: 'Polygon Mainnet',
    etc: 'Ethereum Classic Mainnet',
    zec: 'Zcash Mainnet',
    dash: 'Dash Mainnet',
    eos: 'EOS Mainnet',
    icp: 'Internet Computer'
  };
  const networkTokensSorted = [...new Set(networkSuffixes)].sort((a, b) => b.length - a.length);

  const normalizeToken = (value?: string | null) =>
    value?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || '';
  const normalizeCode = (value?: string | null) => value?.toLowerCase().trim() || '';
  const buildCreditsItem = (amount: number) => ({
    item_id: 'credits_topup',
    item_name: 'Credits Top Up',
    item_category: 'credits',
    price: amount,
    currency: 'USD',
    quantity: 1
  });

  const resolveAliasBase = (baseCode: string) =>
    coinBaseAliases[baseCode] || baseCode;

  const stripNetworkSuffix = (rawCode: string, suffix: string): string | null => {
    if (!suffix) return null;
    if (rawCode.endsWith(suffix) && rawCode.length > suffix.length) {
      return rawCode.slice(0, -suffix.length);
    }
    return null;
  };

  const inferBaseFromPrefix = (rawCode: string): string | null => {
    for (const prefix of networkTokensSorted) {
      if (!rawCode.startsWith(prefix) || rawCode.length <= prefix.length) continue;
      const remainder = rawCode.slice(prefix.length);
      if (!remainder) continue;
      const normalized = normalizeToken(remainder);
      if (normalized.startsWith('usd') || coinBaseAliases[normalized]) {
        return normalized;
      }
    }
    return null;
  };

  function resolveBaseCode(currency: Currency): string {
    const rawCode = normalizeToken(currency.code);
    if (!rawCode) return '';

    const networkCode = normalizeToken(currency.networkCode);
    const networkLabel = normalizeToken(currency.network);
    const baseFromMeta = normalizeToken(currency.baseCode);

    const suffixCandidates = [networkCode, networkLabel, ...networkTokensSorted];
    for (const suffix of suffixCandidates) {
      const candidate = stripNetworkSuffix(rawCode, suffix);
      if (candidate) {
        return resolveAliasBase(candidate);
      }
    }

    const prefixCandidate = inferBaseFromPrefix(rawCode);
    if (prefixCandidate) {
      return resolveAliasBase(prefixCandidate);
    }

    if (baseFromMeta) {
      return resolveAliasBase(baseFromMeta);
    }

    return resolveAliasBase(rawCode);
  }

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const networkNameTokens = new Set(
    [
      ...networkTokensSorted,
      ...Object.values(networkLabels),
      ...Object.values(networkLabelsVerbose)
    ]
      .map(value => value.toLowerCase())
  );

  function stripNetworkFromName(
    name: string,
    network?: string,
    networkCode?: string
  ): string {
    let cleaned = name.trim();
    const tokenSet = new Set<string>();

    [network, networkCode].forEach(value => {
      if (!value) return;
      const raw = value.trim().toLowerCase();
      if (raw) tokenSet.add(raw);
      const normalized = normalizeToken(value);
      if (normalized) tokenSet.add(normalized);
    });
    for (const token of networkNameTokens) {
      if (token) tokenSet.add(token);
    }

    for (const token of tokenSet) {
      const escaped = escapeRegex(token);
      const tokenPattern = token.includes(' ')
        ? token.split(/\s+/).map(escapeRegex).join('[-\\s]*')
        : escaped;
      const parenPattern = new RegExp(`\\s*[\\(\\[]\\s*${tokenPattern}\\s*[\\)\\]]`, 'ig');
      cleaned = cleaned.replace(parenPattern, '').trim();
      const suffixPattern = new RegExp(`\\s*[-/\\s]+${tokenPattern}$`, 'i');
      cleaned = cleaned.replace(suffixPattern, '').trim();
      const trailingPattern = new RegExp(`\\s+${tokenPattern}$`, 'i');
      cleaned = cleaned.replace(trailingPattern, '').trim();
    }

    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    cleaned = cleaned.replace(/[-/]+$/g, '').trim();
    return cleaned.trim();
  }

  function resolveCoinName(baseCode: string, currency?: Currency): string {
    const override = coinNameOverrides[baseCode];
    if (override) return override;
    if (currency?.name) {
      const cleaned = stripNetworkFromName(
        currency.name,
        currency.network,
        currency.networkCode
      );
      const normalizedBase = normalizeToken(baseCode);
      const normalizedCleaned = normalizeToken(cleaned);
      const normalizedCode = normalizeToken(currency.code);
      if (normalizedCleaned && normalizedCleaned === normalizedCode && normalizedCleaned !== normalizedBase) {
        return baseCode.toUpperCase();
      }
      if (normalizedCleaned) {
        for (const token of networkTokensSorted) {
          if (
            normalizedCleaned === `${normalizedBase}${token}` ||
            normalizedCleaned === `${token}${normalizedBase}`
          ) {
            return baseCode.toUpperCase();
          }
        }
      }
      if (cleaned) return cleaned;
    }
    return baseCode.toUpperCase();
  }

  function resolveNetworkTokenFromCode(rawCode: string): string | null {
    for (const token of networkTokensSorted) {
      if ((rawCode.endsWith(token) || rawCode.startsWith(token)) && rawCode.length > token.length) {
        return token;
      }
    }
    return null;
  }

  function resolveNetworkLabelInternal(currency: Currency, verbose: boolean): string {
    const rawCode = normalizeToken(currency.code);
    const baseCode = resolveBaseCode(currency);
    const inferredToken = resolveNetworkTokenFromCode(rawCode);
    const networkValue = currency.network || currency.networkCode;
    const networkToken = normalizeToken(networkValue);
    const isNativeToken = networkToken === 'native' || networkToken === 'nativenetwork';
    const labelMap = verbose ? networkLabelsVerbose : networkLabels;

    if (networkValue && !isNativeToken) {
      return labelMap[networkToken] || networkLabelsVerbose[networkToken] || networkValue;
    }

    if (inferredToken) {
      return labelMap[inferredToken] || networkLabelsVerbose[inferredToken] || inferredToken.toUpperCase();
    }

    const nativeLabel = nativeNetworkNames[baseCode];
    if (nativeLabel) return nativeLabel;

    return verbose ? 'Native network' : 'Native';
  }

  function resolveNetworkLabel(currency: Currency): string {
    return resolveNetworkLabelInternal(currency, false);
  }

  function resolveNetworkLabelFull(currency: Currency): string {
    return resolveNetworkLabelInternal(currency, true);
  }

  function resolveTokenLabel(currency: Currency, baseCode: string): string {
    const rawCode = normalizeToken(currency.code);
    if (!rawCode) return baseCode.toUpperCase();

    const override = tokenSymbolOverrides[rawCode];
    if (override) return override;

    const networkCode = normalizeToken(currency.networkCode);
    const directSuffix = stripNetworkSuffix(rawCode, networkCode);
    if (directSuffix && resolveAliasBase(directSuffix) === baseCode) {
      return baseCode.toUpperCase();
    }

    for (const suffix of networkTokensSorted) {
      const candidate = stripNetworkSuffix(rawCode, suffix);
      if (candidate && resolveAliasBase(candidate) === baseCode) {
        return baseCode.toUpperCase();
      }
    }

    const prefixCandidate = inferBaseFromPrefix(rawCode);
    if (prefixCandidate) {
      const resolved = resolveAliasBase(prefixCandidate);
      if (resolved === baseCode) {
        return tokenSymbolOverrides[prefixCandidate] || baseCode.toUpperCase();
      }
    }

    if (rawCode === baseCode) {
      return baseCode.toUpperCase();
    }

    return baseCode.toUpperCase();
  }

  function isNativeCurrencyNetwork(currency: Currency): boolean {
    const networkCode = normalizeToken(currency.networkCode);
    const networkName = normalizeToken(currency.network);
    const rawCode = normalizeToken(currency.code);
    const baseCode = resolveBaseCode(currency);
    const inferredToken = resolveNetworkTokenFromCode(rawCode);
    const hasSuffix = Boolean(inferredToken);

    if (networkCode === 'native' || networkName === 'native' || networkName === 'nativenetwork') {
      return !hasSuffix;
    }

    return rawCode === baseCode && !hasSuffix;
  }

  $: hasCustomAmount = customAmountInput.trim().length > 0;
  $: parsedCustomAmount = hasCustomAmount ? Number(customAmountInput) : null;
  $: actualAmount = parsedCustomAmount;
  $: numericAmount =
    typeof actualAmount === 'number' && Number.isFinite(actualAmount)
      ? actualAmount
      : null;
  $: displayAmount = numericAmount ?? 0;
  $: selectedMinDeposit = selectedCurrency
    ? minDepositByCurrency[selectedCurrency.code.toLowerCase()]
    : null;
  $: effectiveMinUsd = Math.max(5, selectedMinDeposit?.minUsd ?? 5);
  $: isWholeAmount = numericAmount !== null && Number.isInteger(numericAmount);
  $: isValidAmount =
    numericAmount !== null &&
    isWholeAmount &&
    numericAmount >= effectiveMinUsd &&
    numericAmount <= 10000;
  $: filteredCoinOptions = coinOptions.filter(coin => {
    const query = coinSearch.trim().toLowerCase();
    if (!query) return true;
    return coin.code.toLowerCase().includes(query) || coin.name.toLowerCase().includes(query);
  });

  $: if (isOpen && !isCurrencyLoading && currencies.length > 0 && coinOptions.length === 0) {
    coinOptions = buildCoinOptions(currencies);
  }

  $: if (isOpen && coinOptions.length > 0) {
    const defaultCoin = resolveDefaultCoin(coinOptions);
    if (!selectedCoin || !coinOptions.find(coin => coin.code === selectedCoin)) {
      selectedCoin = defaultCoin?.code || null;
    }
  }

  const handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as Node | null;
    const clickedCoin =
      (coinDropdownRef && target ? coinDropdownRef.contains(target) : false) ||
      (coinTriggerRef && target ? coinTriggerRef.contains(target) : false);
    if (!clickedCoin) {
      coinDropdownOpen = false;
    }

    const clickedNetwork =
      (networkDropdownRef && target ? networkDropdownRef.contains(target) : false) ||
      (networkTriggerRef && target ? networkTriggerRef.contains(target) : false);
    if (!clickedNetwork) {
      networkDropdownOpen = false;
    }
  };

  onMount(() => {
    if (isOpen) {
      void loadCurrencies();
    }
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  });

  onDestroy(() => {
    stopPolling();
  });

  $: if (isOpen && currentStep === 1 && currencies.length === 0 && !isCurrencyLoading) {
    void loadCurrencies();
  }

  $: if (currentStep === 1) {
    paymentData = null;
    paymentStatus = 'waiting';
  }

  $: if (isOpen && resumePayment?.paymentId && resumePayment.paymentId !== resumedPaymentId) {
    resumedPaymentId = resumePayment.paymentId;
    if (currencies.length === 0) {
      void loadCurrencies();
    }
    applyResumedPayment(resumePayment);
  }


  async function loadCurrencies() {
    try {
      isCurrencyLoading = true;
      error = '';

      currencies = await paymentService.getSupportedCurrencies();
      coinOptions = buildCoinOptions(currencies);

      if (coinOptions.length > 0) {
        const defaultCoin = resolveDefaultCoin(coinOptions);
        if (!selectedCoin || !coinOptions.find(coin => coin.code === selectedCoin)) {
          selectedCoin = defaultCoin?.code || null;
        }
      }

      if (selectedCoin) {
        networkOptions = resolveNetworkOptions(currencies, selectedCoin);
        const selectedCode = selectedCurrency?.code;
        if (!selectedCode || !networkOptions.find(option => option.code === selectedCode)) {
          selectedCurrency = resolveDefaultNetwork(networkOptions);
        }
      }

      if (currencies.length === 0) {
        throw new Error('Empty currency list received');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MODAL] Error loading currencies:', err);
      error = `Failed to load available currencies: ${message}`;
    } finally {
      isCurrencyLoading = false;
    }
  }

  async function loadMinDeposit(currencyCode: string) {
    const normalized = currencyCode.toLowerCase();
    if (minDepositByCurrency[normalized] || minDepositRequests.has(normalized)) {
      return;
    }

    minDepositRequests.add(normalized);
    try {
      const minDeposit = await paymentService.getMinimumDeposit(normalized);
      minDepositByCurrency = {
        ...minDepositByCurrency,
        [normalized]: {
          currency: minDeposit.currency,
          minAmount: minDeposit.minAmount,
          minUsd: minDeposit.minUsd,
          ...(minDeposit.fiatEquivalent !== undefined
            ? { fiatEquivalent: minDeposit.fiatEquivalent }
            : {})
        }
      };
    } catch (err) {
      console.error('[MODAL] Failed to load minimum deposit for', normalized, err);
    } finally {
      minDepositRequests.delete(normalized);
    }
  }

  async function prefetchMinDeposits(options: Currency[]) {
    const targets = options
      .map(option => option.code?.toLowerCase())
      .filter((code): code is string => Boolean(code));

    await Promise.all(targets.map(code => loadMinDeposit(code)));
  }

  function handleAmountInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    const nextValue = target?.value ?? '';
    customAmountInput = nextValue.replace(/[^\d]/g, '');
  }

  function buildCoinOptions(availableCurrencies: Currency[]): CoinOption[] {
    const byCode = new Map<string, CoinOption>();

    availableCurrencies.forEach(currency => {
      const baseCode = resolveBaseCode(currency);
      if (!baseCode) return;

      const existing = byCode.get(baseCode);
      const candidateName = resolveCoinName(baseCode, currency);

      if (!existing) {
        byCode.set(baseCode, {
          code: baseCode,
          name: candidateName,
          image: currency.image,
          isStable: currency.isStable,
          isPopular: currency.isPopular
        });
        return;
      }

      if (candidateName && existing.name === baseCode.toUpperCase()) {
        existing.name = candidateName;
      }

      if (!existing.image && currency.image) {
        existing.image = currency.image;
      }

      if (existing.isStable === undefined && currency.isStable !== undefined) {
        existing.isStable = currency.isStable;
      }

      if (existing.isPopular === undefined && currency.isPopular !== undefined) {
        existing.isPopular = currency.isPopular;
      }
    });

    return Array.from(byCode.values()).sort((a, b) => {
      const rankA = preferredCoinRank.get(a.code);
      const rankB = preferredCoinRank.get(b.code);
      if (rankA !== undefined || rankB !== undefined) {
        return (rankA ?? Number.POSITIVE_INFINITY) - (rankB ?? Number.POSITIVE_INFINITY);
      }

      const stableScore = Number(Boolean(b.isStable)) - Number(Boolean(a.isStable));
      if (stableScore !== 0) return stableScore;

      const popularScore = Number(Boolean(b.isPopular)) - Number(Boolean(a.isPopular));
      if (popularScore !== 0) return popularScore;

      return a.name.localeCompare(b.name);
    });
  }

  function resolveDefaultCoin(availableCoins: CoinOption[]): CoinOption | null {
    if (availableCoins.length === 0) {
      return null;
    }

    const matchStable = availableCoins.find(coin =>
      stableDefaultCodes.includes(coin.code.toLowerCase())
    );
    if (matchStable) {
      return matchStable;
    }

    const stableFallback = availableCoins.find(coin => coin.isStable);
    return stableFallback || availableCoins[0];
  }

  function resolveNetworkOptions(
    availableCurrencies: Currency[],
    coinCode: string
  ): Currency[] {
    const normalizedCoin = normalizeCode(coinCode);
    const options = availableCurrencies.filter(
      currency => resolveBaseCode(currency) === normalizedCoin
    );
    const hasNonNative = options.some(option => !isNativeCurrencyNetwork(option));
    const keepNative = Boolean(nativeNetworkNames[normalizedCoin]);
    const filteredOptions = hasNonNative && !keepNative
      ? options.filter(option => !isNativeCurrencyNetwork(option))
      : options;

    const preferredNetworks = [
      'trc20',
      'erc20',
      'bep20',
      'bsc',
      'polygon',
      'matic',
      'sol',
      'solana',
      'base',
      'native'
    ];
    const rankNetwork = (currency: Currency): number => {
      const code = normalizeCode(currency.networkCode || currency.network || '');
      const index = preferredNetworks.indexOf(code);
      return index === -1 ? preferredNetworks.length : index;
    };

    return filteredOptions.sort((a, b) => {
      const rankDiff = rankNetwork(a) - rankNetwork(b);
      if (rankDiff !== 0) return rankDiff;
      return (a.network || 'Native').localeCompare(b.network || 'Native');
    });
  }

  function resolveDefaultNetwork(options: Currency[]): Currency | null {
    if (options.length === 0) {
      return null;
    }
    return options[0];
  }

  function resolveCurrencyByCode(code: string, availableCurrencies: Currency[] = currencies): Currency | null {
    const normalized = normalizeToken(code);
    return availableCurrencies.find(option => normalizeToken(option.code) === normalized) || null;
  }

  function resolvePreferredCurrency(code: string, availableCurrencies: Currency[]): Currency {
    const resolved = resolveCurrencyByCode(code, availableCurrencies);
    const fallback: Currency = resolved || { code, name: code.toUpperCase() };
    if (!resolved) {
      const baseCode = resolveBaseCode(fallback);
      const options = resolveNetworkOptions(availableCurrencies, baseCode);
      return options[0] || fallback;
    }

    if (isNativeCurrencyNetwork(resolved)) {
      const baseCode = resolveBaseCode(resolved);
      const options = resolveNetworkOptions(availableCurrencies, baseCode);
      if (options.length > 0) {
        return options[0];
      }
    }

    return resolved;
  }

  function getPaymentCurrencyLabels(
    code: string,
    availableCurrencies: Currency[]
  ): { tokenLabel: string; networkLabel: string } {
    const resolved = resolvePreferredCurrency(code, availableCurrencies);
    const baseCode = resolveBaseCode(resolved);
    return {
      tokenLabel: resolveTokenLabel(resolved, baseCode),
      networkLabel: resolveNetworkLabelFull(resolved)
    };
  }

  function getSelectedNetworkLabel(currency: Currency | null): string {
    if (!currency) return 'selected network';
    const baseCode = resolveBaseCode(currency);
    const tokenLabel = resolveTokenLabel(currency, baseCode);
    const networkLabel = resolveNetworkLabel(currency);
    return `${tokenLabel} (${networkLabel})`;
  }

  $: paymentLabels = paymentData ? getPaymentCurrencyLabels(paymentData.payCurrency, currencies) : null;

  $: if (selectedCoin && currencies.length > 0) {
    networkOptions = resolveNetworkOptions(currencies, selectedCoin);
    const selectedCode = selectedCurrency?.code;
    if (!selectedCode || !networkOptions.find(option => option.code === selectedCode)) {
      selectedCurrency = resolveDefaultNetwork(networkOptions);
    }
  }

  $: if (selectedCurrency?.code) {
    void loadMinDeposit(selectedCurrency.code);
  }

  $: if (networkOptions.length > 0) {
    void prefetchMinDeposits(networkOptions);
  }

  async function handleCreatePayment() {
    if (!isValidAmount || !selectedCurrency || numericAmount === null) return;

    try {
      isCreatingPayment = true;
      error = '';

      const amount = numericAmount;
      const payCurrency = selectedCurrency.code;

      const response = await paymentService.createPayment({
        creditAmount: amount,
        price_currency: 'usd',
        pay_currency: payCurrency.toLowerCase(),
        orderDescription: `Add ${amount} credits`
      });

      paymentData = response;
      paymentStatus = response.status;
      expirationTime = new Date(response.expiresAt);

      await generateQRCode(response.payAddress);

      if (response.paymentId && response.paymentId !== lastTopupTrackingId) {
        const item = buildCreditsItem(amount);
        trackTikTokInitiateCheckout('USD', amount, [item]);
        trackTikTokAddPaymentInfo('USD', amount, [item]);
        lastTopupTrackingId = response.paymentId;
      }

      currentStep = 2;
      if (onPaymentCreated) {
        onPaymentCreated(response);
      }
      startStatusPolling(response.paymentId);
      startExpirationTimer();

    } catch (err) {
      error = resolveErrorMessage(
        err,
        'Failed to create payment. Please try again.'
      );
      console.error('Error creating payment:', err);
    } finally {
      isCreatingPayment = false;
    }
  }

  function applyResumedPayment(payment: ResumablePayment) {
    stopPolling();
    const expiresAt = payment.expiresAt ? new Date(payment.expiresAt) : null;

    paymentData = {
      paymentId: payment.paymentId,
      payAddress: payment.payAddress,
      payAmount: payment.payAmount,
      payCurrency: payment.payCurrency,
      expiresAt: expiresAt ? expiresAt.toISOString() : new Date().toISOString(),
      status: payment.status || 'waiting'
    };

    paymentStatus = payment.status || 'waiting';
    expirationTime = expiresAt;
    timeRemaining = '';
    qrCodeDataUrl = '';
    void generateQRCode(payment.payAddress);
    currentStep = 2;
    startStatusPolling(payment.paymentId);
    startExpirationTimer();
  }

  async function pollPaymentStatus() {
    try {
      const status = await paymentService.getPaymentStatus(paymentData!.paymentId);

      if (!status) {
        console.warn('[PAYMENT] Status not found, payment may not be in database yet');
        return;
      }

      paymentStatus = status.status;

      if (status.status === 'finished' || status.status === 'confirmed') {
        stopPolling();
        if (paymentData?.paymentId && paymentData.paymentId !== lastTopupPurchaseTrackingId) {
          const creditAmount = status.creditAmount;
          if (typeof creditAmount === 'number' && Number.isFinite(creditAmount)) {
            const item = buildCreditsItem(creditAmount);
            trackTikTokPurchase('USD', creditAmount, [item]);
            lastTopupPurchaseTrackingId = paymentData.paymentId;
          }
        }

        setTimeout(async () => {
          const newBalance = userBalance + status.creditAmount;
          onSuccess(newBalance);
          alert(`Payment successful! ${status.creditAmount} credits have been added to your account.`);
          isOpen = false;
        }, 2000);
      }

      if (['failed', 'expired', 'refunded'].includes(status.status)) {
        stopPolling();
        error = `Payment ${status.status}. Please try again or contact support.`;
      }
    } catch (err) {
      console.error('[PAYMENT] Error polling payment status:', err);
    }
  }

  function startStatusPolling(paymentId: string) {
    pollPaymentStatus();
    pollInterval = setInterval(pollPaymentStatus, 10000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function startExpirationTimer() {
    const timer = setInterval(() => {
      if (!expirationTime) return;

      const now = new Date();
      const diff = expirationTime.getTime() - now.getTime();

      if (diff <= 0) {
        timeRemaining = 'Expired';
        clearInterval(timer);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      timeRemaining = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }

  async function generateQRCode(address: string) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(address, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  }

  function copyAddress() {
    if (!paymentData) return;

    navigator.clipboard.writeText(paymentData.payAddress).then(() => {
      addressCopied = true;
      setTimeout(() => addressCopied = false, 2000);
    }).catch(err => {
      console.error('Failed to copy address:', err);
    });
  }

  function copyAmount() {
    if (!paymentData) return;

    navigator.clipboard.writeText(String(paymentData.payAmount)).then(() => {
      amountCopied = true;
      setTimeout(() => amountCopied = false, 2000);
    }).catch(err => {
      console.error('Failed to copy amount:', err);
    });
  }

  function closeModal() {
    isOpen = false;
    currentStep = 1;
    customAmountInput = '';
    selectedCoin = null;
    selectedCurrency = null;
    coinOptions = [];
    networkOptions = [];
    minDepositByCurrency = {};
    minDepositRequests.clear();
    paymentData = null;
    paymentStatus = 'waiting';
    qrCodeDataUrl = '';
    addressCopied = false;
    amountCopied = false;
    isCurrencyLoading = false;
    isCreatingPayment = false;
    error = '';
    expirationTime = null;
    timeRemaining = '';
    coinDropdownOpen = false;
    networkDropdownOpen = false;
    coinSearch = '';
    resumedPaymentId = null;
    stopPolling();
  }

  function selectCoin(coin: CoinOption) {
    selectedCoin = coin.code;
    coinSearch = '';
    coinDropdownOpen = false;
    networkDropdownOpen = false;
  }

  function selectNetwork(currency: Currency) {
    selectedCurrency = currency;
    networkDropdownOpen = false;
    void loadMinDeposit(currency.code);
  }

  function getCoinDisplayName(coin: CoinOption): string {
    return coin.name || coin.code.toUpperCase();
  }

  function getNetworkDisplayName(currency: Currency): string {
    const baseCode = resolveBaseCode(currency);
    const tokenLabel = resolveTokenLabel(currency, baseCode);
    const networkLabel = resolveNetworkLabel(currency);
    return `${tokenLabel} (${networkLabel})`;
  }

  function getStatusText(status: PaymentStatus): string {
    switch (status) {
      case 'waiting': return 'Waiting for payment';
      case 'confirming': return 'Confirming transaction';
      case 'confirmed': return 'Payment confirmed';
      case 'sending': return 'Processing payment';
      case 'partially_paid': return 'Partially paid';
      case 'finished': return 'Payment completed';
      case 'failed': return 'Payment failed';
      case 'refunded': return 'Payment refunded';
      case 'expired': return 'Payment expired';
      default: return 'Unknown status';
    }
  }

  function resolveErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: string }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    return fallback;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
    <div class="relative flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[95vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white shadow-sm">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900">Add credits</h2>
            </div>
          </div>
          <button
            on:click={closeModal}
            class="rounded-lg p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {#if error}
          <div class="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <div class="flex items-start gap-3">
              <div class="rounded-lg bg-red-100 p-1">
                <AlertCircle class="h-4 w-4 text-red-500" />
              </div>
              <p class="text-sm font-medium text-red-700">{error}</p>
            </div>
          </div>
        {/if}

        <div class={`flex-1 px-6 ${currentStep === 1 ? 'py-6 overflow-visible' : 'py-5 overflow-y-auto'}`}>
          {#if currentStep === 1}
            <div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div class="flex items-start gap-2">
                <AlertCircle size={16} class="mt-0.5 text-amber-600" />
                <div>
                  <p class="font-semibold text-amber-900">Crypto-only credits</p>
                  <p class="text-amber-800">
                    Credit topups and credit payments are intended for crypto. You can still buy any product
                    directly with card at checkout without adding credits.
                  </p>
                </div>
              </div>
            </div>
          {/if}
          {#if currentStep === 1}
            <div class="grid gap-6 lg:grid-cols-2">
              <div class="space-y-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">Choose coin and network</h3>
                  <p class="text-sm text-gray-600">Pick the coin, then choose its network.</p>
                </div>

                {#if isCurrencyLoading}
                  <div class="flex items-center justify-center py-8 text-sm text-gray-600">
                    <Loader2 class="animate-spin text-cyan-500" size={18} />
                    <span class="ml-2">Loading currencies...</span>
                  </div>
                {:else if currencies.length > 0}
                  <div class="grid gap-4">
                    <div class="relative">
                      <button
                        on:click={() => {
                          coinDropdownOpen = !coinDropdownOpen;
                          networkDropdownOpen = false;
                        }}
                        bind:this={coinTriggerRef}
                        class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50 transition"
                      >
                        <div class="flex items-center justify-between">
                          <div class="flex flex-col">
                            <span class="text-sm font-semibold text-gray-900">
                              {selectedCoin
                                ? getCoinDisplayName(
                                    coinOptions.find(coin => coin.code === selectedCoin) || {
                                      code: selectedCoin,
                                      name: selectedCoin.toUpperCase()
                                    }
                                  )
                                : 'Select a coin'}
                            </span>
                            {#if selectedCoin}
                              <span class="text-xs text-gray-500 uppercase mt-1">{selectedCoin}</span>
                            {/if}
                          </div>
                          <ChevronDown size={16} class={`text-gray-500 transition-transform ${coinDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {#if coinDropdownOpen}
                        <div
                          class="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
                          bind:this={coinDropdownRef}
                        >
                          <div class="px-3 py-2 border-b border-gray-100">
                            <div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
                              <Search size={14} class="text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search coins"
                                class="w-full text-sm text-gray-700 focus:outline-none"
                                bind:value={coinSearch}
                              />
                            </div>
                          </div>
                          <div class="max-h-72 overflow-y-auto">
                            {#each filteredCoinOptions as coin}
                              <button
                                on:click={() => selectCoin(coin)}
                                class={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between ${selectedCoin === coin.code ? 'bg-cyan-50' : ''}`}
                              >
                                <div class="flex flex-col">
                                  <span class="text-sm font-semibold text-gray-900">{getCoinDisplayName(coin)}</span>
                                  <span class="text-xs text-gray-500 uppercase mt-1">{coin.code}</span>
                                </div>
                                {#if selectedCoin === coin.code}
                                  <Check size={16} class="text-cyan-600" />
                                {/if}
                              </button>
                            {/each}
                            {#if filteredCoinOptions.length === 0}
                              <div class="px-4 py-3 text-sm text-gray-500">No coins match your search.</div>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>

                    <div class="relative">
                      <button
                        on:click={() => {
                          networkDropdownOpen = !networkDropdownOpen;
                          coinDropdownOpen = false;
                        }}
                        bind:this={networkTriggerRef}
                        class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={!selectedCoin || networkOptions.length === 0}
                      >
                        <div class="flex items-center justify-between">
                          <div class="flex flex-col">
                            <span class="text-sm font-semibold text-gray-900">
                              {selectedCurrency ? getNetworkDisplayName(selectedCurrency) : 'Select a network'}
                            </span>
                            {#if selectedCurrency}
                              <span class="text-xs text-gray-500 uppercase mt-1">{selectedCurrency.code}</span>
                            {/if}
                          </div>
                          <ChevronDown size={16} class={`text-gray-500 transition-transform ${networkDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {#if networkDropdownOpen}
                        <div
                          class="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
                          bind:this={networkDropdownRef}
                        >
                          <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                            Choose network
                          </div>
                          <div class="max-h-72 overflow-y-auto">
                            {#each networkOptions as network}
                              <button
                                on:click={() => selectNetwork(network)}
                                class={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between ${selectedCurrency?.code === network.code ? 'bg-cyan-50' : ''}`}
                              >
                                <div class="flex flex-col">
                                  <span class="text-sm font-semibold text-gray-900">{getNetworkDisplayName(network)}</span>
                                  <span class="text-xs text-gray-500 uppercase mt-1">{network.code}</span>
                                  {#if minDepositByCurrency[network.code.toLowerCase()]}
                                    <span class="text-xs text-gray-400 mt-1">Min. ${minDepositByCurrency[network.code.toLowerCase()].minUsd} deposit</span>
                                  {/if}
                                </div>
                                {#if selectedCurrency?.code === network.code}
                                  <Check size={16} class="text-cyan-600" />
                                {/if}
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                  {#if selectedCurrency}
                    <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                      Minimum deposit for {getSelectedNetworkLabel(selectedCurrency)} is ${effectiveMinUsd} credits.
                    </div>
                  {/if}
                {:else}
                  <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
                    No currencies available. Please try again later.
                  </div>
                {/if}
              </div>

              <div class="space-y-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">Choose your credit amount</h3>
                  <p class="text-sm text-gray-600">Enter the number of credits you want to add.</p>
                </div>

                <div>
                  <label for="custom-amount" class="block text-sm font-semibold text-gray-700 mb-2">
                    Credit amount (USD)
                  </label>
                  <input
                    id="custom-amount"
                    type="text"
                    value={customAmountInput}
                    on:input={handleAmountInput}
                    inputmode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter amount"
                    class="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <p class="text-xs text-gray-500 mt-2">
                    1 USD = 1 Credit • Minimum for {getSelectedNetworkLabel(selectedCurrency)} is ${effectiveMinUsd}
                  </p>
                  {#if hasCustomAmount && !isWholeAmount}
                    <p class="text-xs text-red-600 mt-2">Amount must be a whole number.</p>
                  {/if}
                  {#if numericAmount !== null && numericAmount < effectiveMinUsd}
                    <p class="text-xs text-red-600 mt-2">Minimum deposit is {effectiveMinUsd} credits.</p>
                  {/if}
                </div>

                <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Amount to add</span>
                    <span class="text-lg font-semibold text-gray-900">{displayAmount} credits</span>
                  </div>
                </div>

              </div>
            </div>
          {:else if currentStep === 2 && paymentData}
            <div class="space-y-4">
              <div class="text-center">
                <h3 class="text-lg font-semibold text-gray-900">Payment details</h3>
                <p class="text-sm text-gray-600">
                  Send exactly <span class="font-semibold text-gray-900">{paymentData.payAmount} {paymentLabels?.tokenLabel ?? paymentData.payCurrency.toUpperCase()}</span>
                  on <span class="font-semibold text-gray-900">{paymentLabels?.networkLabel ?? 'selected network'}</span>
                </p>
              </div>

              <div class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] items-start">
                <div class="space-y-4">
                  <div>
                    <label for="payment-address" class="block text-sm font-semibold text-gray-700 mb-2">
                      Payment address
                    </label>
                    <div class="flex overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <input
                        id="payment-address"
                        type="text"
                        value={paymentData.payAddress}
                        readonly
                        class="flex-1 px-4 py-3 text-sm font-mono text-gray-900 focus:outline-none"
                      />
                      <button
                        on:click={copyAddress}
                        class="px-4 py-3 bg-gradient-to-r from-cyan-500 to-pink-500 text-white hover:opacity-90 transition"
                      >
                        {#if addressCopied}
                          <Check size={16} class="text-white" />
                        {:else}
                          <Copy size={16} class="text-white" />
                        {/if}
                      </button>
                    </div>
                    {#if addressCopied}
                      <p class="mt-2 text-xs font-semibold text-green-600 flex items-center gap-1">
                        <Check size={14} />
                        Address copied to clipboard!
                      </p>
                    {/if}
                  </div>

                  <div>
                    <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <span class="text-sm text-gray-600">Amount to send</span>
                          <div class="text-lg font-semibold text-gray-900">{paymentData.payAmount}</div>
                        </div>
                        <button
                          on:click={copyAmount}
                          class="rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-3 py-2 text-white hover:opacity-90 transition"
                        >
                          {#if amountCopied}
                            <Check size={16} class="text-white" />
                          {:else}
                            <Copy size={16} class="text-white" />
                          {/if}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      class="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800"
                    >
                      <AlertCircle size={14} class="mt-0.5 text-amber-600" />
                      <span>
                        This payment is for {paymentLabels?.tokenLabel ?? paymentData.payCurrency.toUpperCase()}
                        on {paymentLabels?.networkLabel ?? 'selected network'}. Make sure you send the correct currency and
                        amount on the correct network.
                      </span>
                    </button>
                  </div>

                  <div class="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                    <p class="font-medium text-gray-700">Your payment will be automatically detected.</p>
                    <p class="mt-1">Credits will be added once confirmed on the blockchain.</p>
                  </div>
                </div>

                <div class="space-y-4 text-center">
                  <div class={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold
                    ${paymentStatus === 'waiting' ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
                     paymentStatus === 'confirming' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                     ['confirmed', 'finished'].includes(paymentStatus) ? 'border-green-200 bg-green-50 text-green-700' :
                     'border-red-200 bg-red-50 text-red-700'}`}>
                    {getStatusText(paymentStatus)}
                  </div>

                  {#if timeRemaining && paymentStatus === 'waiting'}
                    <div class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
                      <Clock size={14} class="text-cyan-500" />
                      Expires in: <span class="font-semibold text-gray-900">{timeRemaining}</span>
                    </div>
                  {/if}

                  {#if qrCodeDataUrl}
                    <div>
                      <div class="inline-block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <img
                          src={qrCodeDataUrl}
                          alt="Payment QR Code"
                          width="200"
                          height="200"
                          class="mx-auto rounded-lg"
                        />
                      </div>
                      <p class="mt-2 text-xs text-gray-500">Scan with your crypto wallet</p>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            on:click={closeModal}
            class="inline-flex items-center px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>

          {#if currentStep === 1}
            <button
              on:click={handleCreatePayment}
              disabled={!isValidAmount || !selectedCurrency || isCreatingPayment}
              class="inline-flex items-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 text-sm font-semibold text-white shadow-sm hover:opacity-90
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if isCreatingPayment}
                <Loader2 class="animate-spin mr-2" size={16} />
                Creating payment...
              {:else}
                Create payment
              {/if}
            </button>
          {:else}
            <button
              on:click={() => { currentStep = 1; }}
              class="px-5 py-2.5 rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-black transition-colors"
            >
              Back to edit
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
