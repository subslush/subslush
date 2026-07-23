import type { FastifyReply } from 'fastify';
import type { SellableProductErrorCode } from '../services/sellableProductService';
import { HttpStatus, sendError } from './response';

const catalogErrorMessages: Record<SellableProductErrorCode, string> = {
  PRODUCT_ID_REQUIRED: 'A product_id is required.',
  PRODUCT_UNAVAILABLE: 'The requested product is unavailable.',
  INVALID_FIXED_CONFIGURATION:
    'The product has an invalid fixed duration or price configuration.',
  STALE_PRICE: 'The product price changed. Refresh pricing and try again.',
  UNSUPPORTED_CURRENCY: 'The requested currency is not supported.',
  LEGACY_IDENTIFIER_CONFLICT:
    'product_id and variant_id identify different products.',
  INVALID_DURATION: 'The requested duration does not match this product.',
  PRICE_UNAVAILABLE: 'No current price is available in the requested currency.',
};

const catalogCodes = new Set<string>(Object.keys(catalogErrorMessages));

export const isSellableProductErrorCode = (
  value: string
): value is SellableProductErrorCode => catalogCodes.has(value);

export const sendSellableProductError = (
  reply: FastifyReply,
  code: SellableProductErrorCode,
  details?: Record<string, unknown>
): FastifyReply => {
  const status =
    code === 'PRODUCT_UNAVAILABLE'
      ? HttpStatus.NOT_FOUND
      : code === 'STALE_PRICE' || code === 'LEGACY_IDENTIFIER_CONFLICT'
        ? HttpStatus.CONFLICT
        : HttpStatus.BAD_REQUEST;
  return sendError(
    reply,
    status,
    'Catalog Contract Error',
    catalogErrorMessages[code],
    code,
    details
  );
};
