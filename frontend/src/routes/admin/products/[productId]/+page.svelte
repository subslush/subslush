<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import { logoKeys } from '$lib/assets/logoRegistry.js';
  import { SUPPORTED_CURRENCIES, type SupportedCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import type {
    AdminProduct,
    AdminProductVariant,
    AdminProductVariantTerm,
    AdminProductLabel,
    AdminPriceHistory
  } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let product: AdminProduct = data.product;
  let variants: AdminProductVariant[] = data.variants;
  let variantTerms: AdminProductVariantTerm[] = data.variantTerms || [];
  let assignedLabels: AdminProductLabel[] = data.assignedLabels;
  let labels: AdminProductLabel[] = data.labels;
  let priceHistory: AdminPriceHistory[] = data.priceHistory || [];

  let productMessage = '';
  let productError = '';
  let productSaving = false;
  let statusUpdating = false;
  let showStatusConfirm = false;
  let pendingStatus: 'active' | 'inactive' | null = null;
  let isProductActive = false;
  $: isProductActive = (product.status || 'inactive') === 'active';

  let variantMessage = '';
  let variantError = '';
  let variantSaving = false;
  let variantDeleteError = '';
  let variantDeletingId: string | null = null;
  let showVariantDeleteConfirm = false;
  let pendingVariantDelete: AdminProductVariant | null = null;

  let termMessage = '';
  let termError = '';
  let termSaving = false;

  let labelMessage = '';
  let labelError = '';
  let labelSaving = false;


  let priceMessage = '';
  let priceError = '';
  let priceSaving = false;

  const productStatusMap = {
    active: 'success',
    inactive: 'danger'
  } as const;

  const variantStatusMap = {
    true: 'success',
    false: 'warning'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const parseListInput = (value: string): string[] =>
    value
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0);

  const formatListInput = (value: unknown): string => {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('\n');
    }
    if (typeof value === 'string') {
      return parseListInput(value).join('\n');
    }
    return '';
  };

  const normalizeMetadata = (
    value: Record<string, unknown> | null | undefined
  ): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const readMetadataString = (
    metadata: Record<string, unknown>,
    keys: string[]
  ): string => {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string') {
        return value;
      }
    }
    return '';
  };

  const readMetadataList = (
    metadata: Record<string, unknown>,
    keys: string[]
  ): string[] => {
    for (const key of keys) {
      const value = metadata[key];
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        );
      }
      if (typeof value === 'string') {
        return parseListInput(value);
      }
    }
    return [];
  };

  const coerceMetadataBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      const numeric = Number(normalized);
      if (Number.isFinite(numeric)) return numeric > 0;
    }
    return false;
  };

  const readUpgradeOptions = (
    metadata: Record<string, unknown>
  ): { allowNewAccount: boolean; allowOwnAccount: boolean; manualMonthlyUpgrade: boolean } => {
    const raw = metadata['upgrade_options'] ?? metadata['upgradeOptions'];
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      return { allowNewAccount: false, allowOwnAccount: false, manualMonthlyUpgrade: false };
    }
    const record = parsed as Record<string, unknown>;
    return {
      allowNewAccount: coerceMetadataBoolean(
        record['allow_new_account'] ?? record['allowNewAccount']
      ),
      allowOwnAccount: coerceMetadataBoolean(
        record['allow_own_account'] ?? record['allowOwnAccount']
      ),
      manualMonthlyUpgrade: coerceMetadataBoolean(
        record['manual_monthly_upgrade'] ?? record['manualMonthlyUpgrade']
      )
    };
  };

  const buildVariantMetadata = (
    base: Record<string, unknown>,
    input: { displayName: string; features: string; badges: string }
  ): Record<string, unknown> => {
    const next = { ...base };
    const displayName = input.displayName.trim();
    if (displayName) {
      next.display_name = displayName;
    } else {
      delete next.display_name;
      delete next.displayName;
    }

    const features = parseListInput(input.features);
    if (features.length > 0) {
      next.features = features;
    } else {
      delete next.features;
    }

    const badges = parseListInput(input.badges);
    if (badges.length > 0) {
      next.badges = badges;
    } else {
      delete next.badges;
    }

    return next;
  };

  const buildProductMetadata = (
    base: Record<string, unknown>,
    input: {
      termsConditions: string;
      upgradeOptions: {
        allowNewAccount: boolean;
        allowOwnAccount: boolean;
        manualMonthlyUpgrade: boolean;
      };
    }
  ): Record<string, unknown> => {
    const next = { ...base };
    const terms = parseListInput(input.termsConditions);
    if (terms.length > 0) {
      next.terms_conditions = terms;
    } else {
      delete next.terms_conditions;
      delete next.termsConditions;
      delete next.terms;
    }
    const upgradeOptions = input.upgradeOptions;
    const hasUpgradeOptions =
      upgradeOptions.allowNewAccount ||
      upgradeOptions.allowOwnAccount ||
      upgradeOptions.manualMonthlyUpgrade;
    if (hasUpgradeOptions) {
      next.upgrade_options = {
        allow_new_account: upgradeOptions.allowNewAccount,
        allow_own_account: upgradeOptions.allowOwnAccount,
        manual_monthly_upgrade: upgradeOptions.manualMonthlyUpgrade
      };
    } else {
      delete next.upgrade_options;
      delete next.upgradeOptions;
    }
    return next;
  };

  type ProductForm = {
    name: string;
    slug: string;
    serviceType: string;
    status: 'active' | 'inactive';
    description: string;
    logoKey: string;
    category: string;
    maxSubscriptions: string;
    termsConditions: string;
    allowNewAccount: boolean;
    allowOwnAccount: boolean;
    manualMonthlyUpgrade: boolean;
  };

  type VariantForm = {
    name: string;
    variantCode: string;
    servicePlan: string;
    description: string;
    sortOrder: number;
    isActive: boolean;
    displayName: string;
    features: string;
    badges: string;
  };

  const buildVariantForm = (variant: AdminProductVariant): VariantForm => {
    const metadata = normalizeMetadata(variant.metadata);
    return {
      name: variant.name || '',
      variantCode: pickValue(variant.variantCode, variant.variant_code) || '',
      servicePlan: pickValue(variant.servicePlan, variant.service_plan) || '',
      description: variant.description || '',
      sortOrder: Number(pickValue(variant.sortOrder, variant.sort_order) ?? 0),
      isActive: !!pickValue(variant.isActive, variant.is_active),
      displayName: readMetadataString(metadata, ['display_name', 'displayName']),
      features: formatListInput(readMetadataList(metadata, ['features'])),
      badges: formatListInput(readMetadataList(metadata, ['badges']))
    };
  };

  type TermForm = {
    months: string;
    discountPercent: string;
    sortOrder: number;
    isActive: boolean;
    isRecommended: boolean;
  };

  const resolveTermVariantId = (term: AdminProductVariantTerm): string =>
    pickValue(term.productVariantId, term.product_variant_id) || '';

  const buildTermForm = (term: AdminProductVariantTerm): TermForm => ({
    months: String(term.months ?? ''),
    discountPercent:
      term.discount_percent !== undefined && term.discount_percent !== null
        ? String(term.discount_percent)
        : '',
    sortOrder: Number(pickValue(term.sortOrder, term.sort_order) ?? 0),
    isActive: !!pickValue(term.isActive, term.is_active),
    isRecommended: !!pickValue(term.isRecommended, term.is_recommended)
  });

  const buildProductForm = (value: AdminProduct) => {
    const metadata = normalizeMetadata(value.metadata);
    const upgradeOptions = readUpgradeOptions(metadata);
    const maxSubscriptions = pickValue(value.maxSubscriptions, value.max_subscriptions);
    return {
      name: value.name || '',
      slug: value.slug || '',
      serviceType: pickValue(value.serviceType, value.service_type) || '',
      status: (value.status || 'active') as 'active' | 'inactive',
      description: value.description || '',
      logoKey: pickValue(value.logoKey, value.logo_key) || '',
      category: value.category || '',
      maxSubscriptions:
        maxSubscriptions !== undefined && maxSubscriptions !== null
          ? String(maxSubscriptions)
          : '',
      termsConditions: formatListInput(
        readMetadataList(metadata, ['terms_conditions', 'termsConditions', 'terms'])
      ),
      allowNewAccount: upgradeOptions.allowNewAccount,
      allowOwnAccount: upgradeOptions.allowOwnAccount,
      manualMonthlyUpgrade: upgradeOptions.manualMonthlyUpgrade
    };
  };

  let productForm: ProductForm = buildProductForm(product);
  let termsCount = 0;
  $: termsCount = parseListInput(productForm.termsConditions).length;
  let variantForms: Record<string, VariantForm> = variants.reduce(
    (acc, variant) => {
      acc[variant.id] = buildVariantForm(variant);
      return acc;
    },
    {} as Record<string, VariantForm>
  );
  let variantUpdatingId: string | null = null;

  let termForms: Record<string, TermForm> = variantTerms.reduce(
    (acc, term) => {
      acc[term.id] = buildTermForm(term);
      return acc;
    },
    {} as Record<string, TermForm>
  );
  let termUpdatingId: string | null = null;
  let termVariantId = variants[0]?.id ?? '';

  $: if (variants.length === 0) {
    termVariantId = '';
  } else if (!termVariantId || !variants.some(variant => variant.id === termVariantId)) {
    termVariantId = variants[0].id;
  }

  $: filteredTerms = variantTerms.filter(
    term => resolveTermVariantId(term) === termVariantId
  );

  let newVariant = {
    name: '',
    variantCode: '',
    servicePlan: '',
    description: '',
    sortOrder: 0,
    isActive: true,
    displayName: '',
    features: '',
    badges: ''
  };


  let newTerm = {
    months: '',
    discountPercent: '',
    sortOrder: 0,
    isActive: true,
    isRecommended: false
  };

  const buildPriceAmounts = (): Record<SupportedCurrency, string> =>
    SUPPORTED_CURRENCIES.reduce(
      (acc, currency) => {
        acc[currency] = '';
        return acc;
      },
      {} as Record<SupportedCurrency, string>
    );

  const parsePriceTimestamp = (value?: string | null): number | null => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const isPriceActive = (price: AdminPriceHistory, now: number): boolean => {
    const startsAt = parsePriceTimestamp(pickValue(price.startsAt, price.starts_at));
    if (startsAt === null || startsAt > now) return false;
    const endsAt = parsePriceTimestamp(pickValue(price.endsAt, price.ends_at));
    return endsAt === null || endsAt > now;
  };

  const buildEmptyActivePrices = (): Record<SupportedCurrency, AdminPriceHistory | null> =>
    SUPPORTED_CURRENCIES.reduce(
      (acc, currency) => {
        acc[currency] = null;
        return acc;
      },
      {} as Record<SupportedCurrency, AdminPriceHistory | null>
    );

  const buildActivePricesForVariant = (
    variantId: string,
    prices: AdminPriceHistory[]
  ): Record<SupportedCurrency, AdminPriceHistory | null> => {
    const result = buildEmptyActivePrices();
    if (!variantId) return result;
    const now = Date.now();
    for (const price of prices) {
      const priceVariantId = pickValue(price.productVariantId, price.product_variant_id);
      if (!priceVariantId || priceVariantId !== variantId) continue;
      if (!isPriceActive(price, now)) continue;
      const currency = normalizeCurrencyCode(price.currency);
      if (!currency) continue;
      const startsAt = parsePriceTimestamp(pickValue(price.startsAt, price.starts_at)) ?? -Infinity;
      const existing = result[currency];
      if (!existing) {
        result[currency] = price;
        continue;
      }
      const existingStart =
        parsePriceTimestamp(pickValue(existing.startsAt, existing.starts_at)) ?? -Infinity;
      if (startsAt > existingStart) {
        result[currency] = price;
      }
    }
    return result;
  };

  let newPrice = {
    variantId: '',
    amounts: buildPriceAmounts(),
    startsAt: '',
    endPrevious: true
  };

  let currentPriceVariantId = '';
  let activePricesByCurrency: Record<SupportedCurrency, AdminPriceHistory | null> =
    buildEmptyActivePrices();

  $: if (variants.length === 0) {
    currentPriceVariantId = '';
  } else if (!currentPriceVariantId || !variants.some(variant => variant.id === currentPriceVariantId)) {
    currentPriceVariantId = variants[0].id;
  }

  $: activePricesByCurrency = buildActivePricesForVariant(currentPriceVariantId, priceHistory);

  let assignedLabelIds = new Set<string>();

  $: assignedLabelIds = new Set(assignedLabels.map(label => label.id));

  const resetMessages = () => {
    productMessage = '';
    productError = '';
    variantMessage = '';
    variantError = '';
    variantDeleteError = '';
    termMessage = '';
    termError = '';
    labelMessage = '';
    labelError = '';
    priceMessage = '';
    priceError = '';
  };

  const handleUpdateProduct = async () => {
    resetMessages();
    productSaving = true;
    try {
      const maxSubscriptionsValue = String(productForm.maxSubscriptions ?? '').trim();
      const parsedMaxSubscriptions = Number(maxSubscriptionsValue);
      const maxSubscriptions =
        maxSubscriptionsValue === '' || Number.isNaN(parsedMaxSubscriptions)
          ? undefined
          : parsedMaxSubscriptions;
      const categoryValue = productForm.category.trim();
      const metadata = buildProductMetadata(normalizeMetadata(product.metadata), {
        termsConditions: productForm.termsConditions,
        upgradeOptions: {
          allowNewAccount: productForm.allowNewAccount,
          allowOwnAccount: productForm.allowOwnAccount,
          manualMonthlyUpgrade: productForm.manualMonthlyUpgrade
        }
      });
      const updated = await adminService.updateProduct(product.id, {
        name: productForm.name,
        slug: productForm.slug,
        description: productForm.description || undefined,
        service_type: productForm.serviceType || undefined,
        logo_key: productForm.logoKey || undefined,
        category: categoryValue || undefined,
        max_subscriptions: maxSubscriptions,
        status: productForm.status,
        metadata
      });
      product = { ...product, ...updated };
      productForm = buildProductForm(product);
      productMessage = 'Product updated successfully.';
    } catch (error) {
      productError = getErrorMessage(error, 'Failed to update product.');
    } finally {
      productSaving = false;
    }
  };

  const requestStatusToggle = () => {
    if (productSaving || statusUpdating) {
      return;
    }
    const currentStatus = (product.status || 'inactive') as 'active' | 'inactive';
    pendingStatus = currentStatus === 'active' ? 'inactive' : 'active';
    showStatusConfirm = true;
  };

  const cancelStatusToggle = () => {
    showStatusConfirm = false;
    pendingStatus = null;
  };

  const confirmStatusToggle = async () => {
    if (!pendingStatus) {
      return;
    }
    resetMessages();
    statusUpdating = true;
    try {
      const updated = await adminService.updateProduct(product.id, { status: pendingStatus });
      product = { ...product, ...updated, status: pendingStatus };
      productForm = { ...productForm, status: pendingStatus };
      productMessage =
        pendingStatus === 'active' ? 'Product activated successfully.' : 'Product deactivated successfully.';
    } catch (error) {
      productError = getErrorMessage(error, 'Failed to update product status.');
    } finally {
      statusUpdating = false;
      showStatusConfirm = false;
      pendingStatus = null;
    }
  };

  const handleCreateVariant = async () => {
    resetMessages();
    variantSaving = true;
    try {
      const metadata = buildVariantMetadata({}, {
        displayName: newVariant.displayName,
        features: newVariant.features,
        badges: newVariant.badges
      });
      const sortOrderValue = Number(newVariant.sortOrder);
      const created = await adminService.createVariant({
        product_id: product.id,
        name: newVariant.name,
        variant_code: newVariant.variantCode.trim() || undefined,
        description: newVariant.description.trim() || undefined,
        service_plan: newVariant.servicePlan.trim() || undefined,
        is_active: newVariant.isActive,
        sort_order: Number.isFinite(sortOrderValue) ? sortOrderValue : 0,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {})
      });
      variants = [created, ...variants];
      variantForms = { ...variantForms, [created.id]: buildVariantForm(created) };
      newVariant = {
        name: '',
        variantCode: '',
        servicePlan: '',
        description: '',
        sortOrder: 0,
        isActive: true,
        displayName: '',
        features: '',
        badges: ''
      };
      variantMessage = 'Variant created successfully.';
    } catch (error) {
      variantError = getErrorMessage(error, 'Failed to create variant.');
    } finally {
      variantSaving = false;
    }
  };

  const handleUpdateVariant = async (variantId: string) => {
    resetMessages();
    const form = variantForms[variantId];
    const current = variants.find(item => item.id === variantId);
    if (!form || !current) {
      variantError = 'Variant not found.';
      return;
    }
    variantUpdatingId = variantId;
    try {
      const metadata = buildVariantMetadata(normalizeMetadata(current.metadata), {
        displayName: form.displayName,
        features: form.features,
        badges: form.badges
      });
      const sortOrderValue = Number(form.sortOrder);
      const payload: Partial<AdminProductVariant> = {
        name: form.name,
        description: form.description.trim() || undefined,
        is_active: form.isActive,
        sort_order: Number.isFinite(sortOrderValue) ? sortOrderValue : 0,
        metadata
      };
      const variantCode = form.variantCode.trim();
      const servicePlan = form.servicePlan.trim();
      if (variantCode) {
        payload.variant_code = variantCode;
      }
      if (servicePlan) {
        payload.service_plan = servicePlan;
      }

      const updated = await adminService.updateVariant(variantId, payload);
      variants = variants.map(item => (item.id === variantId ? { ...item, ...updated } : item));
      variantForms = { ...variantForms, [variantId]: buildVariantForm(updated) };
      variantMessage = 'Variant updated successfully.';
    } catch (error) {
      variantError = getErrorMessage(error, 'Failed to update variant.');
    } finally {
      variantUpdatingId = null;
    }
  };

  const handleToggleVariantActive = async (variantId: string) => {
    resetMessages();
    const form = variantForms[variantId];
    const current = variants.find(item => item.id === variantId);
    if (!current) {
      variantError = 'Variant not found.';
      return;
    }
    const currentState = form ? form.isActive : !!pickValue(current.isActive, current.is_active);
    const nextState = !currentState;
    variantUpdatingId = variantId;
    try {
      const updated = await adminService.updateVariant(variantId, { is_active: nextState });
      variants = variants.map(item =>
        item.id === variantId ? { ...item, ...updated, is_active: nextState, isActive: nextState } : item
      );
      if (form) {
        variantForms = { ...variantForms, [variantId]: { ...form, isActive: nextState } };
      }
      variantMessage = nextState ? 'Variant activated.' : 'Variant deactivated.';
    } catch (error) {
      variantError = getErrorMessage(error, 'Failed to update variant status.');
    } finally {
      variantUpdatingId = null;
    }
  };

  const removeVariantFromState = (variantId: string) => {
    variants = variants.filter(item => item.id !== variantId);
    variantForms = Object.fromEntries(
      Object.entries(variantForms).filter(([id]) => id !== variantId)
    );
    variantTerms = variantTerms.filter(term => resolveTermVariantId(term) !== variantId);
    const remainingTermIds = new Set(variantTerms.map(term => term.id));
    termForms = Object.fromEntries(
      Object.entries(termForms).filter(([id]) => remainingTermIds.has(id))
    );
    priceHistory = priceHistory.filter(
      price => pickValue(price.productVariantId, price.product_variant_id) !== variantId
    );
  };

  const requestVariantDelete = (variant: AdminProductVariant) => {
    variantDeleteError = '';
    pendingVariantDelete = variant;
    showVariantDeleteConfirm = true;
  };

  const cancelVariantDelete = () => {
    showVariantDeleteConfirm = false;
    pendingVariantDelete = null;
    variantDeleteError = '';
  };

  const confirmVariantDelete = async () => {
    if (!pendingVariantDelete) return;
    variantDeleteError = '';
    variantDeletingId = pendingVariantDelete.id;
    try {
      const result = await adminService.deleteVariant(pendingVariantDelete.id);
      if (!result?.deleted) {
        variantDeleteError = 'Failed to delete variant.';
        return;
      }
      const deletedId = pendingVariantDelete.id;
      removeVariantFromState(deletedId);
      if (newPrice.variantId === deletedId) {
        newPrice = { ...newPrice, variantId: '' };
      }
      variantMessage = 'Variant removed.';
      showVariantDeleteConfirm = false;
      pendingVariantDelete = null;
    } catch (error) {
      variantDeleteError = getErrorMessage(error, 'Failed to delete variant.');
    } finally {
      variantDeletingId = null;
    }
  };

  const handleCreateTerm = async () => {
    resetMessages();
    termSaving = true;
    try {
      if (!termVariantId) {
        termError = 'Select a variant to add a duration.';
        return;
      }

      const monthsValue = Number(newTerm.months);
      if (!Number.isFinite(monthsValue) || monthsValue < 1) {
        termError = 'Enter a valid number of months.';
        return;
      }

      const discountRaw = newTerm.discountPercent;
      const discountValue =
        typeof discountRaw === 'string'
          ? discountRaw.trim()
          : discountRaw === null || discountRaw === undefined
            ? ''
            : String(discountRaw);
      const discountPercent = discountValue === '' ? null : Number(discountValue);
      if (
        discountPercent !== null &&
        (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)
      ) {
        termError = 'Discount must be between 0 and 100.';
        return;
      }

      const sortOrderValue = Number(newTerm.sortOrder);
      const created = await adminService.createVariantTerm({
        product_variant_id: termVariantId,
        months: Math.floor(monthsValue),
        discount_percent: discountPercent,
        is_active: newTerm.isActive,
        is_recommended: newTerm.isRecommended,
        sort_order: Number.isFinite(sortOrderValue) ? sortOrderValue : 0
      });

      variantTerms = [created, ...variantTerms];
      termForms = { ...termForms, [created.id]: buildTermForm(created) };
      newTerm = {
        months: '',
        discountPercent: '',
        sortOrder: 0,
        isActive: true,
        isRecommended: false
      };
      termMessage = 'Duration created successfully.';
    } catch (error) {
      termError = getErrorMessage(error, 'Failed to create duration.');
    } finally {
      termSaving = false;
    }
  };

  const handleUpdateTerm = async (termId: string) => {
    resetMessages();
    const form = termForms[termId];
    if (!form) {
      termError = 'Duration not found.';
      return;
    }
    termUpdatingId = termId;
    try {
      const monthsValue = Number(form.months);
      if (!Number.isFinite(monthsValue) || monthsValue < 1) {
        termError = 'Enter a valid number of months.';
        return;
      }

      const discountRaw = form.discountPercent;
      const discountValue =
        typeof discountRaw === 'string'
          ? discountRaw.trim()
          : discountRaw === null || discountRaw === undefined
            ? ''
            : String(discountRaw);
      const discountPercent = discountValue === '' ? null : Number(discountValue);
      if (
        discountPercent !== null &&
        (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)
      ) {
        termError = 'Discount must be between 0 and 100.';
        return;
      }

      const sortOrderValue = Number(form.sortOrder);
      const updated = await adminService.updateVariantTerm(termId, {
        months: Math.floor(monthsValue),
        discount_percent: discountPercent,
        is_active: form.isActive,
        is_recommended: form.isRecommended,
        sort_order: Number.isFinite(sortOrderValue) ? sortOrderValue : 0
      });

      variantTerms = variantTerms.map(term => (term.id === termId ? { ...term, ...updated } : term));
      termForms = { ...termForms, [termId]: buildTermForm(updated) };
      termMessage = 'Duration updated successfully.';
    } catch (error) {
      termError = getErrorMessage(error, 'Failed to update duration.');
    } finally {
      termUpdatingId = null;
    }
  };

  const handleDeleteTerm = async (termId: string) => {
    resetMessages();
    termSaving = true;
    try {
      await adminService.deleteVariantTerm(termId);
      variantTerms = variantTerms.filter(term => term.id !== termId);
      const nextForms = { ...termForms };
      delete nextForms[termId];
      termForms = nextForms;
      termMessage = 'Duration removed.';
    } catch (error) {
      termError = getErrorMessage(error, 'Failed to delete duration.');
    } finally {
      termSaving = false;
    }
  };

  const handleAttachLabel = async (labelId: string) => {
    resetMessages();
    labelSaving = true;
    try {
      assignedLabels = await adminService.attachProductLabel(product.id, labelId);
      labelMessage = 'Label attached.';
    } catch (error) {
      labelError = getErrorMessage(error, 'Failed to attach label.');
    } finally {
      labelSaving = false;
    }
  };

  const handleDetachLabel = async (labelId: string) => {
    resetMessages();
    labelSaving = true;
    try {
      assignedLabels = await adminService.detachProductLabel(product.id, labelId);
      labelMessage = 'Label detached.';
    } catch (error) {
      labelError = getErrorMessage(error, 'Failed to detach label.');
    } finally {
      labelSaving = false;
    }
  };

  const handleToggleLabel = (labelId: string) => {
    if (assignedLabelIds.has(labelId)) {
      void handleDetachLabel(labelId);
      return;
    }
    void handleAttachLabel(labelId);
  };


  const handleCreatePrice = async () => {
    resetMessages();
    priceSaving = true;
    try {
      const invalidCurrencies: SupportedCurrency[] = [];
      const priceEntries = SUPPORTED_CURRENCIES.reduce<
        Array<{ currency: SupportedCurrency; price_cents: number }>
      >((acc, currency) => {
        const rawValue = newPrice.amounts[currency];
        const raw =
          typeof rawValue === 'string'
            ? rawValue.trim()
            : rawValue === null || rawValue === undefined
              ? ''
              : String(rawValue);
        if (!raw) {
          return acc;
        }
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) {
          invalidCurrencies.push(currency);
          return acc;
        }
        acc.push({
          currency,
          price_cents: Math.round(amount * 100)
        });
        return acc;
      }, []);

      if (invalidCurrencies.length > 0) {
        priceError = `Enter valid prices for: ${invalidCurrencies.join(', ')}`;
        return;
      }

      if (priceEntries.length === 0) {
        priceError = 'Enter at least one currency price.';
        return;
      }

      const results = await Promise.allSettled(
        priceEntries.map(entry =>
          adminService.setCurrentPrice({
            product_variant_id: newPrice.variantId,
            price_cents: entry.price_cents,
            currency: entry.currency,
            starts_at: newPrice.startsAt || undefined,
            end_previous: newPrice.endPrevious
          })
        )
      );

      const createdEntries: AdminPriceHistory[] = [];
      const failedCurrencies: SupportedCurrency[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          createdEntries.push(result.value);
        } else {
          failedCurrencies.push(priceEntries[index].currency);
        }
      });

      if (createdEntries.length > 0) {
        const currencyLabel = createdEntries.length === 1 ? 'currency' : 'currencies';
        priceHistory = [...createdEntries, ...priceHistory];
        newPrice = {
          variantId: '',
          amounts: buildPriceAmounts(),
          startsAt: '',
          endPrevious: true
        };
        priceMessage = `Current price set for ${createdEntries.length} ${currencyLabel}.`;
      }

      if (failedCurrencies.length > 0) {
        priceError = `Failed to set price for: ${failedCurrencies.join(', ')}`;
      }
    } catch (error) {
      priceError = getErrorMessage(error, 'Failed to set current price.');
    } finally {
      priceSaving = false;
    }
  };
</script>

<svelte:head>
  <title>{product.name} - Admin</title>
  <meta name="description" content="Manage product details, variants, labels, and pricing." />
</svelte:head>

<div class="space-y-8">
  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div>
        <a class="text-sm font-semibold text-cyan-600" href="/admin/products">Back to products</a>
        <h1 class="text-2xl font-bold text-gray-900 mt-1">{product.name}</h1>
        <p class="text-sm text-gray-500">{product.slug}</p>
      </div>
      <StatusBadge
        label={(product.status || 'inactive').toString()}
        tone={statusToneFromMap(product.status || 'inactive', productStatusMap)}
      />
    </div>
    <p class="text-sm text-gray-600">Update product details and manage catalog assets from this page.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Product Details</h2>
        <p class="text-sm text-gray-500">Edit the core product fields shown across the platform.</p>
      </div>
      <p class="text-xs text-gray-500">Updated {formatOptionalDate(pickValue(product.updatedAt, product.updated_at))}</p>
    </div>
    <form class="space-y-3" on:submit|preventDefault={handleUpdateProduct}>
      <div class="grid gap-3 md:grid-cols-2">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Product name"
          bind:value={productForm.name}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Slug (URL friendly name)"
          bind:value={productForm.slug}
          required
        />
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Service type (e.g. spotify, netflix)"
          bind:value={productForm.serviceType}
        />
        <div class="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
          <div>
            <p class="text-xs font-semibold text-gray-600">Status</p>
            <p class="text-xs text-gray-500">{isProductActive ? 'Active' : 'Inactive'}</p>
          </div>
          <button
            type="button"
            class={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              isProductActive ? 'bg-emerald-500' : 'bg-gray-300'
            } ${statusUpdating || productSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            role="switch"
            aria-checked={isProductActive}
            aria-label="Toggle product status"
            on:click={requestStatusToggle}
            disabled={statusUpdating || productSaving}
          >
            <span
              class={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                isProductActive ? 'translate-x-5' : 'translate-x-1'
              }`}
            ></span>
          </button>
        </div>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Category"
          bind:value={productForm.category}
        />
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          step="1"
          placeholder="Max subscriptions"
          bind:value={productForm.maxSubscriptions}
        />
        <select
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          bind:value={productForm.logoKey}
        >
          <option value="">Logo key (optional)</option>
          {#each logoKeys as key}
            <option value={key}>{key}</option>
          {/each}
        </select>
      </div>
      <textarea
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        rows={3}
        placeholder="Description"
        bind:value={productForm.description}
      ></textarea>
      <div>
        <label for="product-terms" class="text-xs font-semibold text-gray-500">
          Terms & Conditions (one per line, optional)
        </label>
        <textarea
          id="product-terms"
          class="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={5}
          placeholder="Add bullet points as needed"
          bind:value={productForm.termsConditions}
        ></textarea>
        <div class="mt-1 flex items-center justify-between text-xs text-gray-500">
          <span>{termsCount} item{termsCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p class="text-sm font-semibold text-gray-900">Upgrade options</p>
        <p class="text-xs text-gray-500">
          Enable upgrade selection options shown during checkout.
        </p>
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" bind:checked={productForm.allowNewAccount} />
          Allow new account
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" bind:checked={productForm.allowOwnAccount} />
          Allow own account (user provides credentials)
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" bind:checked={productForm.manualMonthlyUpgrade} />
          Manual monthly upgrade (MMU)
        </label>
      </div>
      {#if productMessage}
        <p class="text-sm text-green-600">{productMessage}</p>
      {/if}
      {#if productError}
        <p class="text-sm text-red-600">{productError}</p>
      {/if}
      <button
        class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        type="submit"
        disabled={productSaving}
      >
        {productSaving ? 'Saving...' : 'Save Product'}
      </button>
    </form>
  </section>

  {#if showStatusConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900">
          {pendingStatus === 'active' ? 'Activate product?' : 'Deactivate product?'}
        </h3>
        <p class="mt-2 text-sm text-gray-600">
          {pendingStatus === 'active'
            ? 'This will make the product available to customers.'
            : 'This will remove the product from browse and purchase flows.'}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
            on:click={cancelStatusToggle}
            disabled={statusUpdating}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
            on:click={confirmStatusToggle}
            disabled={statusUpdating}
          >
            {statusUpdating ? 'Updating...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showVariantDeleteConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900">Delete variant?</h3>
        <p class="mt-2 text-sm text-gray-600">
          This will remove "{pendingVariantDelete?.name}" and its terms/pricing. Variants linked to
          existing records cannot be deleted.
        </p>
        {#if variantDeleteError}
          <p class="mt-3 text-sm text-red-600">{variantDeleteError}</p>
        {/if}
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
            on:click={cancelVariantDelete}
            disabled={variantDeletingId !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            on:click={confirmVariantDelete}
            disabled={variantDeletingId !== null}
          >
            {variantDeletingId ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Create Variant</h2>
      <p class="text-sm text-gray-500 mb-4">Add plan variants tied to this product.</p>
      <form class="space-y-3" on:submit|preventDefault={handleCreateVariant}>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Variant name"
            bind:value={newVariant.name}
            required
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Display name (optional)"
            bind:value={newVariant.displayName}
          />
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Variant code (e.g., basic, standard, premium)"
            bind:value={newVariant.variantCode}
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Service plan"
            bind:value={newVariant.servicePlan}
          />
        </div>
        <textarea
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={2}
          placeholder="Description"
          bind:value={newVariant.description}
        ></textarea>
        <textarea
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Features (one per line)"
          bind:value={newVariant.features}
        ></textarea>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            placeholder="Sort order (lower numbers appear first)"
            bind:value={newVariant.sortOrder}
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Badges (comma or new line)"
            bind:value={newVariant.badges}
          />
        </div>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" bind:checked={newVariant.isActive} />
          Active variant
        </label>
        {#if variantMessage}
          <p class="text-sm text-green-600">{variantMessage}</p>
        {/if}
        {#if variantError}
          <p class="text-sm text-red-600">{variantError}</p>
        {/if}
        <button
          class="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900"
          type="submit"
          disabled={variantSaving}
        >
          {variantSaving ? 'Saving...' : 'Create Variant'}
        </button>
      </form>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Assign Labels</h2>
      <p class="text-sm text-gray-500 mb-4">Attach or detach labels to organize this product across the catalog.</p>
      {#if labels.length === 0}
        <AdminEmptyState title="No labels" message="Create labels on the products list before assigning them." />
      {:else}
        <div class="space-y-3">
          {#each labels as label}
            <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-gray-900">{label.name}</p>
                <p class="text-xs text-gray-500">{label.slug}</p>
                {#if assignedLabelIds.has(label.id)}
                  <p class="text-xs font-semibold text-emerald-600 mt-1">Assigned</p>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center rounded-full border border-gray-200 px-2 py-1 text-xs font-semibold"
                  style={`background-color: ${label.color || '#E5E7EB'}; color: #111827;`}
                >
                  {label.color || '#E5E7EB'}
                </span>
                <button
                  class="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-900"
                  type="button"
                  disabled={labelSaving}
                  on:click={() => handleToggleLabel(label.id)}
                >
                  {assignedLabelIds.has(label.id) ? 'Remove' : 'Attach'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if labelMessage}
        <p class="text-sm text-green-600 mt-3">{labelMessage}</p>
      {/if}
      {#if labelError}
        <p class="text-sm text-red-600 mt-3">{labelError}</p>
      {/if}
      <a class="mt-4 inline-flex text-sm font-semibold text-cyan-600" href="/admin/products">Manage labels</a>
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Set Current Price</h2>
      <p class="text-sm text-gray-500 mb-4">Set the active price and optionally end the previous price.</p>
      <form class="grid gap-3 md:grid-cols-2" on:submit|preventDefault={handleCreatePrice}>
        <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" bind:value={newPrice.variantId} required>
          <option value="" disabled>Select variant</option>
          {#each variants as variant}
            <option value={variant.id}>{variant.name}</option>
          {/each}
        </select>
        <div class="grid gap-3 md:col-span-2 sm:grid-cols-2">
          {#each SUPPORTED_CURRENCIES as currencyOption}
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-gray-500" for={`price-${currencyOption}`}>
                {currencyOption} price
              </label>
              <input
                id={`price-${currencyOption}`}
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.01"
                placeholder={`Price (${currencyOption})`}
                bind:value={newPrice.amounts[currencyOption]}
              />
            </div>
          {/each}
        </div>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="date"
          bind:value={newPrice.startsAt}
        />
        <label class="md:col-span-2 flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" bind:checked={newPrice.endPrevious} />
          End previous price when this takes effect
        </label>
        <button
          class="md:col-span-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
          disabled={priceSaving}
        >
          {priceSaving ? 'Saving...' : 'Set Current Price'}
        </button>
      </form>
      {#if priceMessage}
        <p class="text-sm text-green-600 mt-2">{priceMessage}</p>
      {/if}
      {#if priceError}
        <p class="text-sm text-red-600 mt-2">{priceError}</p>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Current active price</h2>
      <p class="text-sm text-gray-500 mb-4">View the active prices for the selected variant.</p>
      {#if variants.length === 0}
        <p class="text-sm text-gray-500">Create a variant to view active pricing.</p>
      {:else}
        <div class="space-y-3">
          <select
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            bind:value={currentPriceVariantId}
          >
            <option value="" disabled>Select variant</option>
            {#each variants as variant}
              <option value={variant.id}>{variant.name}</option>
            {/each}
          </select>
          {#if !currentPriceVariantId}
            <p class="text-sm text-gray-500">Select a variant to view current prices.</p>
          {:else}
            <div class="space-y-2">
              {#each SUPPORTED_CURRENCIES as currencyOption}
                {@const priceEntry = activePricesByCurrency[currencyOption]}
                {@const priceCents = pickValue(priceEntry?.priceCents, priceEntry?.price_cents)}
                <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <span class="text-xs font-semibold text-gray-500">{currencyOption}</span>
                  <span class="text-sm font-semibold text-gray-900">
                    {formatCents(priceCents, currencyOption)}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Variants</h2>
        <p class="text-sm text-gray-500">{variants.length} total</p>
      </div>
      {#if variants.length === 0}
        <AdminEmptyState title="No variants" message="Create a variant to define plan options." />
      {:else}
        <div class="space-y-3">
          {#each variants as variant}
            {@const form = variantForms[variant.id]}
            {@const isActive = form ? form.isActive : !!pickValue(variant.isActive, variant.is_active)}
            {@const isDeleting = variantDeletingId === variant.id}
            <details class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <summary class="flex items-start justify-between gap-3 cursor-pointer list-none">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{form?.name || variant.name}</p>
                  <p class="text-xs text-gray-500">
                    {pickValue(variant.servicePlan, variant.service_plan) ||
                    pickValue(variant.variantCode, variant.variant_code) ||
                    'No plan code'}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class={`text-[10px] font-semibold tracking-wide ${
                      isActive ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <button
                    type="button"
                    class={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                      isActive ? 'bg-emerald-500' : 'bg-gray-300'
                    } ${variantUpdatingId === variant.id || variantDeletingId === variant.id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    role="switch"
                    aria-checked={isActive}
                    aria-label={`Set ${form?.name || variant.name} ${isActive ? 'inactive' : 'active'}`}
                    on:click|stopPropagation={() => handleToggleVariantActive(variant.id)}
                    disabled={variantUpdatingId === variant.id || variantDeletingId === variant.id}
                  >
                    <span
                      class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        isActive ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    ></span>
                  </button>
                </div>
              </summary>
              {#if form}
                <form class="mt-4 space-y-3" on:submit|preventDefault={() => handleUpdateVariant(variant.id)}>
                  <div class="grid gap-3 md:grid-cols-2">
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Variant name"
                      bind:value={form.name}
                      required
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Display name (optional)"
                      bind:value={form.displayName}
                    />
                  </div>
                  <div class="grid gap-3 md:grid-cols-2">
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Variant code (e.g., basic, standard, premium)"
                      bind:value={form.variantCode}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Service plan"
                      bind:value={form.servicePlan}
                    />
                  </div>
                  <textarea
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Description"
                    bind:value={form.description}
                  ></textarea>
                  <textarea
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Features (one per line)"
                    bind:value={form.features}
                  ></textarea>
                  <div class="grid gap-3 md:grid-cols-2">
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      type="number"
                      min="0"
                      placeholder="Sort order (lower numbers appear first)"
                      bind:value={form.sortOrder}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Badges (comma or new line)"
                      bind:value={form.badges}
                    />
                  </div>
                  <label class="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" bind:checked={form.isActive} />
                    Active variant
                  </label>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <button
                      class="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                      type="submit"
                      disabled={variantUpdatingId === variant.id || isDeleting}
                    >
                      {variantUpdatingId === variant.id ? 'Saving...' : 'Save Variant'}
                    </button>
                    <button
                      class="flex-1 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      type="button"
                      disabled={variantUpdatingId === variant.id || isDeleting}
                      on:click={() => requestVariantDelete(variant)}
                    >
                      {isDeleting ? 'Removing...' : 'Remove Variant'}
                    </button>
                  </div>
                </form>
              {/if}
            </details>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Variant Durations & Discounts</h2>
          <p class="text-sm text-gray-500">Define available terms and optional discounts per variant.</p>
        </div>
      </div>
      {#if variants.length === 0}
        <AdminEmptyState
          title="No variants"
          message="Create a variant before adding duration options."
        />
      {:else}
        <div class="grid gap-6 lg:grid-cols-[260px,1fr]">
          <div class="space-y-4">
            <div>
              <label for="term-variant-select" class="text-xs font-semibold text-gray-500">
                Variant
              </label>
              <select
                id="term-variant-select"
                class="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                bind:value={termVariantId}
              >
                {#each variants as variant}
                  <option value={variant.id}>{variant.name}</option>
                {/each}
              </select>
            </div>

            <form class="space-y-3" on:submit|preventDefault={handleCreateTerm}>
              <div class="grid gap-3 md:grid-cols-2">
                <input
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  type="number"
                  min="1"
                  placeholder="Months"
                  bind:value={newTerm.months}
                  required
                />
                <input
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Discount % (e.g., 10 for 10%)"
                  bind:value={newTerm.discountPercent}
                />
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <input
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  type="number"
                  min="0"
                  placeholder="Sort order (lower numbers appear first)"
                  bind:value={newTerm.sortOrder}
                />
                <label class="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" bind:checked={newTerm.isRecommended} />
                  Recommended
                </label>
              </div>
              <label class="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" bind:checked={newTerm.isActive} />
                Active term
              </label>
              {#if termMessage}
                <p class="text-sm text-green-600">{termMessage}</p>
              {/if}
              {#if termError}
                <p class="text-sm text-red-600">{termError}</p>
              {/if}
              <button
                class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                type="submit"
                disabled={termSaving}
              >
                {termSaving ? 'Saving...' : 'Add Duration'}
              </button>
            </form>
          </div>

          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900">Existing terms</h3>
              <p class="text-xs text-gray-500">{filteredTerms.length} options</p>
            </div>

            {#if filteredTerms.length === 0}
              <AdminEmptyState
                title="No durations yet"
                message="Add term lengths for this variant to make it purchasable."
              />
            {:else}
              <div class="space-y-3">
                {#each filteredTerms as term}
                  {@const form = termForms[term.id]}
                  <details class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <summary class="flex items-center justify-between cursor-pointer list-none">
                      <div>
                        <p class="text-sm font-semibold text-gray-900">
                          {term.months} months
                        </p>
                        {#if term.discount_percent !== undefined && term.discount_percent !== null}
                          <p class="text-xs text-emerald-600">{term.discount_percent}% discount</p>
                        {/if}
                      </div>
                      <StatusBadge
                        label={pickValue(term.isActive, term.is_active) ? 'active' : 'inactive'}
                        tone={statusToneFromMap(
                          String(!!pickValue(term.isActive, term.is_active)),
                          variantStatusMap
                        )}
                      />
                    </summary>
                    {#if form}
                      <form
                        class="mt-4 space-y-3"
                        on:submit|preventDefault={() => handleUpdateTerm(term.id)}
                      >
                        <div class="grid gap-3 md:grid-cols-2">
                          <input
                            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            type="number"
                            min="1"
                            bind:value={form.months}
                          />
                          <input
                            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="Discount % (e.g., 10 for 10%)"
                            bind:value={form.discountPercent}
                          />
                        </div>
                        <div class="grid gap-3 md:grid-cols-2">
                          <input
                            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            type="number"
                            min="0"
                            placeholder="Sort order (lower numbers appear first)"
                            bind:value={form.sortOrder}
                          />
                          <label class="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" bind:checked={form.isRecommended} />
                            Recommended
                          </label>
                        </div>
                        <label class="flex items-center gap-2 text-sm text-gray-600">
                          <input type="checkbox" bind:checked={form.isActive} />
                          Active term
                        </label>
                        <div class="flex flex-col gap-2 sm:flex-row">
                          <button
                            class="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                            type="submit"
                            disabled={termUpdatingId === term.id}
                          >
                            {termUpdatingId === term.id ? 'Saving...' : 'Save Term'}
                          </button>
                          <button
                            class="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
                            type="button"
                            disabled={termSaving}
                            on:click={() => handleDeleteTerm(term.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </form>
                    {/if}
                  </details>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Price History</h2>
        <p class="text-sm text-gray-500">{priceHistory.length} entries</p>
      </div>
      {#if priceHistory.length === 0}
        <AdminEmptyState title="No pricing history" message="Add pricing entries to track changes." />
      {:else}
        <div class="space-y-3">
          {#each priceHistory as price}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p class="text-sm font-semibold text-gray-900">
                {formatCents(pickValue(price.priceCents, price.price_cents), price.currency || 'USD')}
              </p>
              <p class="text-xs text-gray-500">
                Starts {formatOptionalDate(pickValue(price.startsAt, price.starts_at))}
              </p>
              {#if pickValue(price.endsAt, price.ends_at)}
                <p class="text-xs text-gray-500">
                  Ends {formatOptionalDate(pickValue(price.endsAt, price.ends_at))}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>
