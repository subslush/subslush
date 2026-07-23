import type { FastifyReply } from 'fastify';
import { Logger } from './logger';

export const LEGACY_VARIANT_SUNSET = 'Wed, 31 Mar 2027 23:59:59 GMT';
export const LEGACY_VARIANT_DEPRECATION_DOC =
  '/docs/product-api-contract.md#legacy-variant-compatibility';

type LegacyIdentifierMetric = {
  accepted: number;
  conflicts: number;
  byContext: Record<string, number>;
};

const metric: LegacyIdentifierMetric = {
  accepted: 0,
  conflicts: 0,
  byContext: {},
};

export const recordLegacyVariantUsage = (params: {
  context: string;
  variantId: string;
  productId?: string | null;
}): void => {
  metric.accepted += 1;
  metric.byContext[params.context] =
    (metric.byContext[params.context] ?? 0) + 1;
  Logger.warn('Legacy catalog identifier accepted', {
    event: 'catalog_api_legacy_variant_used',
    context: params.context,
    variantId: params.variantId,
    productId: params.productId ?? null,
    sunset: LEGACY_VARIANT_SUNSET,
  });
};

export const recordLegacyVariantConflict = (params: {
  context: string;
  variantId: string;
  productId: string;
  resolvedProductId?: string | null;
}): void => {
  metric.conflicts += 1;
  Logger.warn('Conflicting product and legacy variant identifiers rejected', {
    event: 'catalog_api_legacy_identifier_conflict',
    ...params,
  });
};

export const attachLegacyVariantDeprecation = (reply: FastifyReply): void => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', LEGACY_VARIANT_SUNSET);
  reply.header(
    'Link',
    `<${LEGACY_VARIANT_DEPRECATION_DOC}>; rel="deprecation"; type="text/markdown"`
  );
  reply.header('X-API-Deprecated-Fields', 'variant_id');
};

export const getLegacyVariantCompatibilityMetrics =
  (): Readonly<LegacyIdentifierMetric> => ({
    accepted: metric.accepted,
    conflicts: metric.conflicts,
    byContext: { ...metric.byContext },
  });

export const resetLegacyVariantCompatibilityMetrics = (): void => {
  metric.accepted = 0;
  metric.conflicts = 0;
  metric.byContext = {};
};
