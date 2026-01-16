type MetadataValue = Record<string, any> | null | undefined;

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractCurrency = (metadata: MetadataValue): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const raw =
    metadata['currency'] ??
    metadata['default_currency'] ??
    metadata['defaultCurrency'];
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
};

export const resolveMetadataPriceCents = (
  metadata: MetadataValue
): number | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const cents = normalizeNumber(
    metadata['price_cents'] ?? metadata['priceCents']
  );
  if (cents !== null) {
    return Math.round(cents);
  }

  const price = normalizeNumber(metadata['price']);
  if (price !== null) {
    return Math.round(price * 100);
  }

  return null;
};

export const resolveLegacyPriceCents = (params: {
  variantMetadata?: MetadataValue;
  productMetadata?: MetadataValue;
  handlerPrice?: number | null;
}): number | null => {
  const variantPrice = resolveMetadataPriceCents(params.variantMetadata);
  if (variantPrice !== null) {
    return variantPrice;
  }

  const productPrice = resolveMetadataPriceCents(params.productMetadata);
  if (productPrice !== null) {
    return productPrice;
  }

  if (params.handlerPrice !== null && params.handlerPrice !== undefined) {
    const numeric = normalizeNumber(params.handlerPrice);
    if (numeric !== null) {
      return Math.round(numeric * 100);
    }
  }

  return null;
};

export const resolveLegacyCurrency = (params: {
  variantMetadata?: MetadataValue;
  productMetadata?: MetadataValue;
  defaultCurrency?: string | null | undefined;
}): string => {
  return (
    extractCurrency(params.variantMetadata) ||
    extractCurrency(params.productMetadata) ||
    (typeof params.defaultCurrency === 'string'
      ? params.defaultCurrency.trim().toUpperCase()
      : '') ||
    'USD'
  );
};
