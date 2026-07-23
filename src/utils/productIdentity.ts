import { Logger } from './logger';

export type ProductIdentitySource =
  | 'explicit_product_id'
  | 'parent_product_id'
  | 'legacy_variant_product_id'
  | 'validated_metadata_product_id'
  | 'unresolved';

type ProductIdentityReadInput = {
  context: string;
  recordId?: string | null | undefined;
  explicitProductId?: string | null | undefined;
  parentProductId?: string | null | undefined;
  variantProductId?: string | null | undefined;
  metadataProductId?: string | null | undefined;
};

export type ProductIdentityResolution = {
  productId: string | null;
  source: ProductIdentitySource;
  conflict: boolean;
  candidates: string[];
};

const counters: Record<ProductIdentitySource | 'conflict', number> = {
  explicit_product_id: 0,
  parent_product_id: 0,
  legacy_variant_product_id: 0,
  validated_metadata_product_id: 0,
  unresolved: 0,
  conflict: 0,
};

const normalizeId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const resolveDurableProductIdentity = (
  input: ProductIdentityReadInput
): ProductIdentityResolution => {
  const ordered: Array<[ProductIdentitySource, string | null]> = [
    ['explicit_product_id', normalizeId(input.explicitProductId)],
    ['parent_product_id', normalizeId(input.parentProductId)],
    ['legacy_variant_product_id', normalizeId(input.variantProductId)],
    ['validated_metadata_product_id', normalizeId(input.metadataProductId)],
  ];
  const candidates = Array.from(
    new Set(
      ordered
        .map(([, value]) => value)
        .filter((value): value is string => !!value)
    )
  );
  const selected = ordered.find(([, value]) => value !== null);
  const source = selected?.[0] ?? 'unresolved';
  const productId = selected?.[1] ?? null;
  const conflict = candidates.length > 1;

  counters[source] += 1;
  if (conflict) {
    counters.conflict += 1;
    Logger.error('Product identity conflict detected', {
      event: 'catalog_product_identity_conflict',
      context: input.context,
      recordId: input.recordId ?? null,
      selectedProductId: productId,
      source,
      candidates,
    });
  } else if (
    source === 'legacy_variant_product_id' ||
    source === 'validated_metadata_product_id'
  ) {
    Logger.warn('Legacy product identity fallback used', {
      event: 'catalog_product_identity_fallback',
      context: input.context,
      recordId: input.recordId ?? null,
      productId,
      source,
    });
  } else if (source === 'unresolved') {
    Logger.warn('Product identity unresolved', {
      event: 'catalog_product_identity_unresolved',
      context: input.context,
      recordId: input.recordId ?? null,
    });
  }

  return { productId, source, conflict, candidates };
};

export const getProductIdentityTelemetry = (): Readonly<
  Record<ProductIdentitySource | 'conflict', number>
> => ({ ...counters });

export const resetProductIdentityTelemetry = (): void => {
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) {
    counters[key] = 0;
  }
};

export const buildFulfillmentConfigSnapshot = (
  metadata: Record<string, any> | null | undefined
): Record<string, unknown> => {
  const source = metadata || {};
  const snapshot: Record<string, unknown> = {};
  const upgradeOptions = source['upgrade_options'] ?? source['upgradeOptions'];
  if (upgradeOptions !== undefined)
    snapshot['upgrade_options'] = upgradeOptions;

  for (const key of [
    'delivery_format_label',
    'delivery_format_description',
    'activation_guide',
    'info_box_text',
  ]) {
    if (source[key] !== undefined) snapshot[key] = source[key];
  }
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
};
