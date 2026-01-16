import { parseJsonValue } from './json';

type CatalogMetadata = Record<string, any> | null | undefined;

export function shouldUseHandler(metadata: CatalogMetadata): boolean {
  if (!metadata) {
    return false;
  }

  const rawRules = metadata['rules'];
  const rules =
    typeof rawRules === 'string'
      ? (parseJsonValue<Record<string, any> | null>(rawRules, null) ?? {})
      : ((rawRules ?? {}) as Record<string, any>);
  const flag =
    metadata['use_handler'] ??
    metadata['useHandler'] ??
    rules['use_handler'] ??
    rules['useHandler'];

  if (typeof flag === 'boolean') {
    return flag;
  }
  if (typeof flag === 'string') {
    return flag.trim().toLowerCase() === 'true';
  }
  if (typeof flag === 'number') {
    return flag > 0;
  }

  return false;
}

export function getMetadataSchema(
  metadata: CatalogMetadata
): Record<string, any> | null {
  if (!metadata) {
    return null;
  }

  const rawRules = metadata['rules'];
  const rules =
    typeof rawRules === 'string'
      ? (parseJsonValue<Record<string, any> | null>(rawRules, null) ?? {})
      : ((rawRules ?? {}) as Record<string, any>);
  const schemaValue =
    rules['metadata_schema'] ??
    rules['metadataSchema'] ??
    rules['subscription_metadata_schema'] ??
    rules['subscriptionMetadataSchema'];

  if (schemaValue !== undefined) {
    return parseJsonValue<Record<string, any> | null>(schemaValue, null);
  }

  const looksLikeSchema =
    typeof rules['type'] === 'string' ||
    typeof rules['$schema'] === 'string' ||
    typeof rules['properties'] === 'object';

  return looksLikeSchema ? rules : null;
}
