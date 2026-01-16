import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import {
  Product,
  ProductVariant,
  ProductVariantTerm,
  ProductLabel,
  ProductMedia,
  PriceHistory,
  ProductDetail,
  CatalogListing,
  CreateProductLabelInput,
  CreateProductMediaInput,
  UpdateProductLabelInput,
  UpdateProductMediaInput,
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  UpdateVariantInput,
  CreatePriceHistoryInput,
  ListVariantFilters,
  ListPriceHistoryFilters,
  CreateVariantTermInput,
  UpdateVariantTermInput,
  ListVariantTermFilters,
} from '../types/catalog';
import {
  ServiceResult,
  createSuccessResult,
  createErrorResult,
} from '../types/service';
import { normalizeCurrencyCode } from '../utils/currency';
import {
  normalizeUpgradeOptions,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';

function parseMetadata(value: any): Record<string, any> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function normalizeServiceType(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    service_type: row.service_type,
    logo_key: row.logo_key,
    category: row.category,
    default_currency: row.default_currency,
    max_subscriptions: row.max_subscriptions,
    status: row.status,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapVariant(row: any): ProductVariant {
  return {
    id: row.id,
    product_id: row.product_id,
    name: row.name,
    variant_code: row.variant_code,
    description: row.description,
    service_plan: row.service_plan,
    is_active: row.is_active,
    sort_order: row.sort_order,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapVariantTerm(row: any): ProductVariantTerm {
  return {
    id: row.id,
    product_variant_id: row.product_variant_id,
    months: row.months,
    discount_percent: row.discount_percent,
    is_active: row.is_active,
    is_recommended: row.is_recommended,
    sort_order: row.sort_order,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLabel(row: any): ProductLabel {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMedia(row: any): ProductMedia {
  return {
    id: row.id,
    product_id: row.product_id,
    media_type: row.media_type,
    url: row.url,
    alt_text: row.alt_text,
    sort_order: row.sort_order,
    is_primary: row.is_primary,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPriceHistory(row: any): PriceHistory {
  return {
    id: row.id,
    product_variant_id: row.product_variant_id,
    price_cents: row.price_cents,
    currency: row.currency,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
  };
}

export class CatalogService {
  async createProduct(
    input: CreateProductInput
  ): Promise<ServiceResult<Product>> {
    try {
      if (input.default_currency) {
        const normalizedCurrency = normalizeCurrencyCode(
          input.default_currency
        );
        if (!normalizedCurrency) {
          return createErrorResult('Unsupported default currency');
        }
      }

      if (input.metadata) {
        const upgradeOptions = normalizeUpgradeOptions(input.metadata);
        const validation = validateUpgradeOptions(upgradeOptions);
        if (!validation.valid) {
          return createErrorResult(
            validation.reason || 'Invalid upgrade options configuration'
          );
        }
      }

      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO products
          (name, slug, description, service_type, logo_key, category, default_currency, max_subscriptions, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.name,
          input.slug,
          input.description || null,
          normalizeServiceType(input.service_type),
          input.logo_key || null,
          input.category || null,
          normalizeCurrencyCode(input.default_currency) || null,
          input.max_subscriptions ?? null,
          input.status || 'active',
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      return createSuccessResult(mapProduct(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create product:', error);
      return createErrorResult('Failed to create product');
    }
  }

  async updateProduct(
    productId: string,
    updates: UpdateProductInput
  ): Promise<ServiceResult<Product>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${++paramCount}`);
        values.push(updates.name);
      }
      if (updates.slug !== undefined) {
        updateFields.push(`slug = $${++paramCount}`);
        values.push(updates.slug);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${++paramCount}`);
        values.push(updates.description);
      }
      if (updates.service_type !== undefined) {
        updateFields.push(`service_type = $${++paramCount}`);
        values.push(normalizeServiceType(updates.service_type));
      }
      if (updates.logo_key !== undefined) {
        updateFields.push(`logo_key = $${++paramCount}`);
        values.push(updates.logo_key);
      }
      if (updates.category !== undefined) {
        updateFields.push(`category = $${++paramCount}`);
        values.push(updates.category);
      }
      if (updates.default_currency !== undefined) {
        if (updates.default_currency) {
          const normalizedCurrency = normalizeCurrencyCode(
            updates.default_currency
          );
          if (!normalizedCurrency) {
            return createErrorResult('Unsupported default currency');
          }
        }
        updateFields.push(`default_currency = $${++paramCount}`);
        values.push(normalizeCurrencyCode(updates.default_currency) || null);
      }
      if (updates.max_subscriptions !== undefined) {
        updateFields.push(`max_subscriptions = $${++paramCount}`);
        values.push(updates.max_subscriptions);
      }
      if (updates.status !== undefined) {
        updateFields.push(`status = $${++paramCount}`);
        values.push(updates.status);
      }
      if (updates.metadata !== undefined) {
        if (updates.metadata) {
          const upgradeOptions = normalizeUpgradeOptions(updates.metadata);
          const validation = validateUpgradeOptions(upgradeOptions);
          if (!validation.valid) {
            return createErrorResult(
              validation.reason || 'Invalid upgrade options configuration'
            );
          }
        }
        updateFields.push(`metadata = $${++paramCount}`);
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(productId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE products
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Product not found');
      }

      return createSuccessResult(mapProduct(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update product:', error);
      return createErrorResult('Failed to update product');
    }
  }

  async getProductById(productId: string): Promise<Product | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query('SELECT * FROM products WHERE id = $1', [
        productId,
      ]);
      return result.rows.length > 0 ? mapProduct(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product by id:', error);
      return null;
    }
  }

  async getProductBySlug(slug: string): Promise<Product | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM products WHERE slug = $1',
        [slug]
      );
      return result.rows.length > 0 ? mapProduct(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product by slug:', error);
      return null;
    }
  }

  async getProductByServiceType(serviceType: string): Promise<Product | null> {
    try {
      const pool = getDatabasePool();
      const normalizedServiceType = normalizeServiceType(serviceType);
      if (!normalizedServiceType) {
        return null;
      }
      const result = await pool.query(
        `SELECT * FROM products
         WHERE LOWER(service_type) = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [normalizedServiceType]
      );
      return result.rows.length > 0 ? mapProduct(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product by service type:', error);
      return null;
    }
  }

  async getLabelById(labelId: string): Promise<ProductLabel | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM product_labels WHERE id = $1',
        [labelId]
      );
      return result.rows.length > 0 ? mapLabel(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product label by id:', error);
      return null;
    }
  }

  async updateLabel(
    labelId: string,
    updates: UpdateProductLabelInput
  ): Promise<ServiceResult<ProductLabel>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${++paramCount}`);
        values.push(updates.name);
      }
      if (updates.slug !== undefined) {
        updateFields.push(`slug = $${++paramCount}`);
        values.push(updates.slug);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${++paramCount}`);
        values.push(updates.description);
      }
      if (updates.color !== undefined) {
        updateFields.push(`color = $${++paramCount}`);
        values.push(updates.color);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push('updated_at = NOW()');
      values.push(labelId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE product_labels
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Label not found');
      }

      return createSuccessResult(mapLabel(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update product label:', error);
      return createErrorResult('Failed to update product label');
    }
  }

  async getVariantById(variantId: string): Promise<ProductVariant | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM product_variants WHERE id = $1',
        [variantId]
      );
      return result.rows.length > 0 ? mapVariant(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product variant by id:', error);
      return null;
    }
  }

  async getMediaById(mediaId: string): Promise<ProductMedia | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM product_media WHERE id = $1',
        [mediaId]
      );
      return result.rows.length > 0 ? mapMedia(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch product media by id:', error);
      return null;
    }
  }

  async getProductDetail(
    productId: string
  ): Promise<ServiceResult<ProductDetail>> {
    try {
      const product = await this.getProductById(productId);
      if (!product) {
        return createErrorResult('Product not found');
      }

      const [variants, labels, media, priceHistory, variantTerms] =
        await Promise.all([
          this.listVariantsForAdmin({ product_id: productId }),
          this.listProductLabels(productId),
          this.listMedia({ product_id: productId }),
          this.listPriceHistory({ product_id: productId }),
          this.listVariantTermsForProduct(productId),
        ]);

      return createSuccessResult({
        product,
        variants,
        labels,
        media,
        price_history: priceHistory,
        variant_terms: variantTerms,
      });
    } catch (error) {
      Logger.error('Failed to load product detail:', error);
      return createErrorResult('Failed to load product detail');
    }
  }

  async listProducts(filters?: {
    status?: string;
    service_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<Product[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT * FROM products WHERE 1=1';

      if (filters?.status) {
        sql += ` AND status = $${++paramCount}`;
        params.push(filters.status);
      }
      if (filters?.service_type) {
        sql += ` AND service_type = $${++paramCount}`;
        params.push(filters.service_type);
      }

      sql += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }
      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapProduct);
    } catch (error) {
      Logger.error('Failed to list products:', error);
      return [];
    }
  }

  async createVariant(
    input: CreateVariantInput
  ): Promise<ServiceResult<ProductVariant>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO product_variants
          (product_id, name, variant_code, description, service_plan, is_active, sort_order, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.product_id,
          input.name,
          input.variant_code || null,
          input.description || null,
          input.service_plan || null,
          input.is_active ?? true,
          input.sort_order ?? 0,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      return createSuccessResult(mapVariant(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create product variant:', error);
      return createErrorResult('Failed to create product variant');
    }
  }

  async createVariantTerm(
    input: CreateVariantTermInput
  ): Promise<ServiceResult<ProductVariantTerm>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO product_variant_terms
          (product_variant_id, months, discount_percent, is_active, is_recommended, sort_order, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.product_variant_id,
          input.months,
          input.discount_percent ?? null,
          input.is_active ?? true,
          input.is_recommended ?? false,
          input.sort_order ?? 0,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      return createSuccessResult(mapVariantTerm(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create product variant term:', error);
      return createErrorResult('Failed to create product variant term');
    }
  }

  async updateVariant(
    variantId: string,
    updates: UpdateVariantInput
  ): Promise<ServiceResult<ProductVariant>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${++paramCount}`);
        values.push(updates.name);
      }
      if (updates.variant_code !== undefined) {
        updateFields.push(`variant_code = $${++paramCount}`);
        values.push(updates.variant_code);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${++paramCount}`);
        values.push(updates.description);
      }
      if (updates.service_plan !== undefined) {
        updateFields.push(`service_plan = $${++paramCount}`);
        values.push(updates.service_plan);
      }
      if (updates.is_active !== undefined) {
        updateFields.push(`is_active = $${++paramCount}`);
        values.push(updates.is_active);
      }
      if (updates.sort_order !== undefined) {
        updateFields.push(`sort_order = $${++paramCount}`);
        values.push(updates.sort_order);
      }
      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${++paramCount}`);
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(variantId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE product_variants
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Variant not found');
      }

      return createSuccessResult(mapVariant(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update product variant:', error);
      return createErrorResult('Failed to update product variant');
    }
  }

  async deleteVariant(variantId: string): Promise<ServiceResult<boolean>> {
    try {
      const pool = getDatabasePool();
      const variantResult = await pool.query(
        'SELECT id FROM product_variants WHERE id = $1',
        [variantId]
      );

      if (variantResult.rows.length === 0) {
        return createErrorResult('Variant not found');
      }

      const usageResult = await pool.query(
        `SELECT
           EXISTS(SELECT 1 FROM subscriptions WHERE product_variant_id = $1) AS has_subscriptions,
           EXISTS(SELECT 1 FROM order_items WHERE product_variant_id = $1) AS has_orders,
           EXISTS(SELECT 1 FROM payments WHERE product_variant_id = $1) AS has_payments,
           EXISTS(SELECT 1 FROM credit_transactions WHERE product_variant_id = $1) AS has_credits`,
        [variantId]
      );

      const usage = usageResult.rows[0] || {};
      if (
        usage.has_subscriptions ||
        usage.has_orders ||
        usage.has_payments ||
        usage.has_credits
      ) {
        return createErrorResult(
          'Variant has existing usage records and cannot be deleted. Deactivate it instead.'
        );
      }

      await pool.query('DELETE FROM product_variants WHERE id = $1', [
        variantId,
      ]);
      return createSuccessResult(true);
    } catch (error) {
      Logger.error('Failed to delete product variant:', error);
      return createErrorResult('Failed to delete product variant');
    }
  }

  async updateVariantTerm(
    termId: string,
    updates: UpdateVariantTermInput
  ): Promise<ServiceResult<ProductVariantTerm>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (updates.months !== undefined) {
        updateFields.push(`months = $${++paramCount}`);
        values.push(updates.months);
      }
      if (updates.discount_percent !== undefined) {
        updateFields.push(`discount_percent = $${++paramCount}`);
        values.push(updates.discount_percent);
      }
      if (updates.is_active !== undefined) {
        updateFields.push(`is_active = $${++paramCount}`);
        values.push(updates.is_active);
      }
      if (updates.is_recommended !== undefined) {
        updateFields.push(`is_recommended = $${++paramCount}`);
        values.push(updates.is_recommended);
      }
      if (updates.sort_order !== undefined) {
        updateFields.push(`sort_order = $${++paramCount}`);
        values.push(updates.sort_order);
      }
      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${++paramCount}`);
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(termId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE product_variant_terms
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Variant term not found');
      }

      return createSuccessResult(mapVariantTerm(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update product variant term:', error);
      return createErrorResult('Failed to update product variant term');
    }
  }

  async deleteVariantTerm(termId: string): Promise<ServiceResult<boolean>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'DELETE FROM product_variant_terms WHERE id = $1',
        [termId]
      );
      if ((result.rowCount ?? 0) === 0) {
        return createErrorResult('Variant term not found');
      }
      return createSuccessResult(true);
    } catch (error) {
      Logger.error('Failed to delete product variant term:', error);
      return createErrorResult('Failed to delete product variant term');
    }
  }

  async listVariants(
    productId: string,
    onlyActive = false
  ): Promise<ProductVariant[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM product_variants
         WHERE product_id = $1${onlyActive ? ' AND is_active = TRUE' : ''}
         ORDER BY sort_order ASC, created_at ASC`,
        [productId]
      );
      return result.rows.map(mapVariant);
    } catch (error) {
      Logger.error('Failed to list product variants:', error);
      return [];
    }
  }

  async listActiveListings(filters?: {
    service_type?: string;
  }): Promise<CatalogListing[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.slug AS product_slug,
          p.description AS product_description,
          p.service_type AS product_service_type,
          p.logo_key AS product_logo_key,
          p.category AS product_category,
          p.default_currency AS product_default_currency,
          p.max_subscriptions AS product_max_subscriptions,
          p.status AS product_status,
          p.metadata AS product_metadata,
          p.created_at AS product_created_at,
          p.updated_at AS product_updated_at,
          pv.id AS variant_id,
          pv.product_id AS variant_product_id,
          pv.name AS variant_name,
          pv.variant_code AS variant_variant_code,
          pv.description AS variant_description,
          pv.service_plan AS variant_service_plan,
          pv.is_active AS variant_is_active,
          pv.sort_order AS variant_sort_order,
          pv.metadata AS variant_metadata,
          pv.created_at AS variant_created_at,
          pv.updated_at AS variant_updated_at
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id
        WHERE p.status = 'active'
          AND pv.is_active = TRUE
      `;

      const normalizedServiceType = normalizeServiceType(filters?.service_type);
      if (normalizedServiceType) {
        sql += ` AND LOWER(p.service_type) = $${++paramCount}`;
        params.push(normalizedServiceType);
      }

      sql +=
        ' ORDER BY p.created_at DESC, pv.sort_order ASC, pv.created_at ASC';

      const result = await pool.query(sql, params);
      return result.rows.map(row => ({
        product: mapProduct({
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          description: row.product_description,
          service_type: row.product_service_type,
          logo_key: row.product_logo_key,
          category: row.product_category,
          default_currency: row.product_default_currency,
          max_subscriptions: row.product_max_subscriptions,
          status: row.product_status,
          metadata: row.product_metadata,
          created_at: row.product_created_at,
          updated_at: row.product_updated_at,
        }),
        variant: mapVariant({
          id: row.variant_id,
          product_id: row.variant_product_id,
          name: row.variant_name,
          variant_code: row.variant_variant_code,
          description: row.variant_description,
          service_plan: row.variant_service_plan,
          is_active: row.variant_is_active,
          sort_order: row.variant_sort_order,
          metadata: row.variant_metadata,
          created_at: row.variant_created_at,
          updated_at: row.variant_updated_at,
        }),
      }));
    } catch (error) {
      Logger.error('Failed to list active catalog listings:', error);
      return [];
    }
  }

  async listVariantsForAdmin(
    filters?: ListVariantFilters
  ): Promise<ProductVariant[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT * FROM product_variants WHERE 1=1';

      if (filters?.product_id) {
        sql += ` AND product_id = $${++paramCount}`;
        params.push(filters.product_id);
      }

      if (filters?.service_plan) {
        sql += ` AND service_plan = $${++paramCount}`;
        params.push(filters.service_plan);
      }

      if (filters?.is_active !== undefined) {
        sql += ` AND is_active = $${++paramCount}`;
        params.push(filters.is_active);
      }

      sql += ' ORDER BY sort_order ASC, created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapVariant);
    } catch (error) {
      Logger.error('Failed to list product variants (admin):', error);
      return [];
    }
  }

  async listVariantTerms(
    filters?: ListVariantTermFilters
  ): Promise<ProductVariantTerm[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT * FROM product_variant_terms WHERE 1=1';

      if (filters?.product_variant_id) {
        sql += ` AND product_variant_id = $${++paramCount}`;
        params.push(filters.product_variant_id);
      }

      if (filters?.is_active !== undefined) {
        sql += ` AND is_active = $${++paramCount}`;
        params.push(filters.is_active);
      }

      sql += ' ORDER BY sort_order ASC, months ASC, created_at ASC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapVariantTerm);
    } catch (error) {
      Logger.error('Failed to list product variant terms:', error);
      return [];
    }
  }

  async listVariantTermsForProduct(
    productId: string
  ): Promise<ProductVariantTerm[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT pvt.*
         FROM product_variant_terms pvt
         JOIN product_variants pv ON pv.id = pvt.product_variant_id
         WHERE pv.product_id = $1
         ORDER BY pvt.sort_order ASC, pvt.months ASC, pvt.created_at ASC`,
        [productId]
      );
      return result.rows.map(mapVariantTerm);
    } catch (error) {
      Logger.error('Failed to list product variant terms for product:', error);
      return [];
    }
  }

  async listVariantTermsForVariants(
    variantIds: string[],
    onlyActive = true
  ): Promise<Map<string, ProductVariantTerm[]>> {
    const termsByVariant = new Map<string, ProductVariantTerm[]>();
    if (variantIds.length === 0) {
      return termsByVariant;
    }

    try {
      const pool = getDatabasePool();
      const params: any[] = [variantIds];
      let sql = `
        SELECT *
        FROM product_variant_terms
        WHERE product_variant_id = ANY($1)
      `;
      if (onlyActive) {
        sql += ' AND is_active = TRUE';
      }
      sql += ' ORDER BY sort_order ASC, months ASC, created_at ASC';

      const result = await pool.query(sql, params);
      for (const row of result.rows) {
        const term = mapVariantTerm(row);
        const existing = termsByVariant.get(term.product_variant_id) ?? [];
        existing.push(term);
        termsByVariant.set(term.product_variant_id, existing);
      }
    } catch (error) {
      Logger.error('Failed to list variant terms for variants:', error);
    }

    return termsByVariant;
  }

  async findProductVariantByServicePlan(
    serviceType: string,
    planCode: string
  ): Promise<CatalogListing | null> {
    try {
      const pool = getDatabasePool();
      const normalizedServiceType = normalizeServiceType(serviceType);
      if (!normalizedServiceType) {
        return null;
      }
      const result = await pool.query(
        `SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.slug AS product_slug,
          p.description AS product_description,
          p.service_type AS product_service_type,
          p.logo_key AS product_logo_key,
          p.category AS product_category,
          p.default_currency AS product_default_currency,
          p.max_subscriptions AS product_max_subscriptions,
          p.status AS product_status,
          p.metadata AS product_metadata,
          p.created_at AS product_created_at,
          p.updated_at AS product_updated_at,
          pv.id AS variant_id,
          pv.product_id AS variant_product_id,
          pv.name AS variant_name,
          pv.variant_code AS variant_variant_code,
          pv.description AS variant_description,
          pv.service_plan AS variant_service_plan,
          pv.is_active AS variant_is_active,
          pv.sort_order AS variant_sort_order,
          pv.metadata AS variant_metadata,
          pv.created_at AS variant_created_at,
          pv.updated_at AS variant_updated_at
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id
        WHERE LOWER(p.service_type) = $1
          AND (pv.service_plan = $2 OR pv.variant_code = $2)
        ORDER BY p.created_at DESC, pv.sort_order ASC, pv.created_at ASC
        LIMIT 2`,
        [normalizedServiceType, planCode]
      );

      if (result.rows.length === 0) {
        return null;
      }

      if (result.rows.length > 1) {
        Logger.warn(
          'Ambiguous service plan lookup; multiple variants matched',
          {
            serviceType: normalizedServiceType,
            planCode,
            variants: result.rows.map(row => ({
              productId: row.product_id,
              variantId: row.variant_id,
            })),
          }
        );
        return null;
      }

      const row = result.rows[0];
      return {
        product: mapProduct({
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          description: row.product_description,
          service_type: row.product_service_type,
          logo_key: row.product_logo_key,
          category: row.product_category,
          default_currency: row.product_default_currency,
          max_subscriptions: row.product_max_subscriptions,
          status: row.product_status,
          metadata: row.product_metadata,
          created_at: row.product_created_at,
          updated_at: row.product_updated_at,
        }),
        variant: mapVariant({
          id: row.variant_id,
          product_id: row.variant_product_id,
          name: row.variant_name,
          variant_code: row.variant_variant_code,
          description: row.variant_description,
          service_plan: row.variant_service_plan,
          is_active: row.variant_is_active,
          sort_order: row.variant_sort_order,
          metadata: row.variant_metadata,
          created_at: row.variant_created_at,
          updated_at: row.variant_updated_at,
        }),
      };
    } catch (error) {
      Logger.error(
        'Failed to resolve product/variant for service plan:',
        error
      );
      return null;
    }
  }

  async getVariantWithProduct(
    variantId: string
  ): Promise<CatalogListing | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.slug AS product_slug,
          p.description AS product_description,
          p.service_type AS product_service_type,
          p.logo_key AS product_logo_key,
          p.category AS product_category,
          p.default_currency AS product_default_currency,
          p.max_subscriptions AS product_max_subscriptions,
          p.status AS product_status,
          p.metadata AS product_metadata,
          p.created_at AS product_created_at,
          p.updated_at AS product_updated_at,
          pv.id AS variant_id,
          pv.product_id AS variant_product_id,
          pv.name AS variant_name,
          pv.variant_code AS variant_variant_code,
          pv.description AS variant_description,
          pv.service_plan AS variant_service_plan,
          pv.is_active AS variant_is_active,
          pv.sort_order AS variant_sort_order,
          pv.metadata AS variant_metadata,
          pv.created_at AS variant_created_at,
          pv.updated_at AS variant_updated_at
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1
        LIMIT 1`,
        [variantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        product: mapProduct({
          id: row.product_id,
          name: row.product_name,
          slug: row.product_slug,
          description: row.product_description,
          service_type: row.product_service_type,
          logo_key: row.product_logo_key,
          category: row.product_category,
          default_currency: row.product_default_currency,
          max_subscriptions: row.product_max_subscriptions,
          status: row.product_status,
          metadata: row.product_metadata,
          created_at: row.product_created_at,
          updated_at: row.product_updated_at,
        }),
        variant: mapVariant({
          id: row.variant_id,
          product_id: row.variant_product_id,
          name: row.variant_name,
          variant_code: row.variant_variant_code,
          description: row.variant_description,
          service_plan: row.variant_service_plan,
          is_active: row.variant_is_active,
          sort_order: row.variant_sort_order,
          metadata: row.variant_metadata,
          created_at: row.variant_created_at,
          updated_at: row.variant_updated_at,
        }),
      };
    } catch (error) {
      Logger.error('Failed to fetch variant with product:', error);
      return null;
    }
  }

  async findVariantForServicePlan(
    serviceType: string,
    servicePlan: string
  ): Promise<ProductVariant | null> {
    try {
      const pool = getDatabasePool();
      const normalizedServiceType = normalizeServiceType(serviceType);
      if (!normalizedServiceType) {
        return null;
      }
      const result = await pool.query(
        `SELECT pv.*
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE LOWER(p.service_type) = $1
           AND p.status = 'active'
           AND (pv.service_plan = $2 OR pv.variant_code = $2)
           AND pv.is_active = TRUE
         ORDER BY pv.sort_order ASC, pv.created_at ASC
         LIMIT 1`,
        [normalizedServiceType, servicePlan]
      );
      return result.rows.length > 0 ? mapVariant(result.rows[0]) : null;
    } catch (error) {
      Logger.error(
        'Failed to resolve product variant for service plan:',
        error
      );
      return null;
    }
  }

  async getVariantTerm(
    variantId: string,
    months: number,
    onlyActive = true
  ): Promise<ProductVariantTerm | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM product_variant_terms
         WHERE product_variant_id = $1
           AND months = $2${onlyActive ? ' AND is_active = TRUE' : ''}
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1`,
        [variantId, months]
      );
      return result.rows.length > 0 ? mapVariantTerm(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch variant term:', error);
      return null;
    }
  }

  async getVariantTermById(termId: string): Promise<ProductVariantTerm | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM product_variant_terms WHERE id = $1',
        [termId]
      );
      return result.rows.length > 0 ? mapVariantTerm(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch variant term by id:', error);
      return null;
    }
  }

  async createPriceHistory(
    input: CreatePriceHistoryInput
  ): Promise<ServiceResult<PriceHistory>> {
    try {
      const normalizedCurrency = normalizeCurrencyCode(input.currency);
      if (!normalizedCurrency) {
        return createErrorResult('Unsupported currency');
      }

      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO price_history
          (product_variant_id, price_cents, currency, starts_at, ends_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.product_variant_id,
          input.price_cents,
          normalizedCurrency,
          input.starts_at || new Date(),
          input.ends_at || null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      return createSuccessResult(mapPriceHistory(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create price history entry:', error);
      return createErrorResult('Failed to create price history entry');
    }
  }

  async setCurrentPrice(
    input: CreatePriceHistoryInput,
    options?: { endPrevious?: boolean }
  ): Promise<ServiceResult<PriceHistory>> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;
    const startsAt = input.starts_at || new Date();
    const endPrevious = options?.endPrevious ?? true;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const normalizedCurrency = normalizeCurrencyCode(input.currency);
      if (!normalizedCurrency) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Unsupported currency');
      }

      if (endPrevious) {
        await client.query(
          `UPDATE price_history
           SET ends_at = $1
           WHERE product_variant_id = $2
             AND starts_at < $1
             AND (ends_at IS NULL OR ends_at > $1)
             AND UPPER(currency) = $3`,
          [startsAt, input.product_variant_id, normalizedCurrency]
        );
      }

      const result = await client.query(
        `INSERT INTO price_history
          (product_variant_id, price_cents, currency, starts_at, ends_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.product_variant_id,
          input.price_cents,
          normalizedCurrency,
          startsAt,
          input.ends_at || null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return createSuccessResult(mapPriceHistory(result.rows[0]));
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to set current price entry:', error);
      return createErrorResult('Failed to set current price entry');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback price update transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  async listPriceHistory(
    filters?: ListPriceHistoryFilters
  ): Promise<PriceHistory[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT ph.* FROM price_history ph';

      if (filters?.product_id) {
        sql += ' JOIN product_variants pv ON pv.id = ph.product_variant_id';
      }

      sql += ' WHERE 1=1';

      if (filters?.product_variant_id) {
        sql += ` AND ph.product_variant_id = $${++paramCount}`;
        params.push(filters.product_variant_id);
      }

      if (filters?.product_id) {
        sql += ` AND pv.product_id = $${++paramCount}`;
        params.push(filters.product_id);
      }

      sql += ' ORDER BY ph.starts_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapPriceHistory);
    } catch (error) {
      Logger.error('Failed to list price history:', error);
      return [];
    }
  }

  async createLabel(
    input: CreateProductLabelInput
  ): Promise<ServiceResult<ProductLabel>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO product_labels (name, slug, description, color)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.name, input.slug, input.description || null, input.color || null]
      );

      return createSuccessResult(mapLabel(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create product label:', error);
      return createErrorResult('Failed to create product label');
    }
  }

  async listLabels(filters?: {
    limit?: number;
    offset?: number;
  }): Promise<ProductLabel[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT * FROM product_labels ORDER BY created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapLabel);
    } catch (error) {
      Logger.error('Failed to list product labels:', error);
      return [];
    }
  }

  async listProductLabels(productId: string): Promise<ProductLabel[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT pl.*
         FROM product_label_map plm
         JOIN product_labels pl ON pl.id = plm.label_id
         WHERE plm.product_id = $1
         ORDER BY pl.created_at DESC`,
        [productId]
      );
      return result.rows.map(mapLabel);
    } catch (error) {
      Logger.error('Failed to list product labels:', error);
      return [];
    }
  }

  async addProductLabel(
    productId: string,
    labelId: string
  ): Promise<ServiceResult<ProductLabel[]>> {
    try {
      const product = await this.getProductById(productId);
      if (!product) {
        return createErrorResult('Product not found');
      }

      const label = await this.getLabelById(labelId);
      if (!label) {
        return createErrorResult('Label not found');
      }

      const pool = getDatabasePool();
      await pool.query(
        `INSERT INTO product_label_map (product_id, label_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [productId, labelId]
      );

      const labels = await this.listProductLabels(productId);
      return createSuccessResult(labels);
    } catch (error) {
      Logger.error('Failed to attach product label:', error);
      return createErrorResult('Failed to attach product label');
    }
  }

  async removeProductLabel(
    productId: string,
    labelId: string
  ): Promise<ServiceResult<ProductLabel[]>> {
    try {
      const product = await this.getProductById(productId);
      if (!product) {
        return createErrorResult('Product not found');
      }

      const label = await this.getLabelById(labelId);
      if (!label) {
        return createErrorResult('Label not found');
      }

      const pool = getDatabasePool();
      await pool.query(
        'DELETE FROM product_label_map WHERE product_id = $1 AND label_id = $2',
        [productId, labelId]
      );

      const labels = await this.listProductLabels(productId);
      return createSuccessResult(labels);
    } catch (error) {
      Logger.error('Failed to detach product label:', error);
      return createErrorResult('Failed to detach product label');
    }
  }

  async createMedia(
    input: CreateProductMediaInput
  ): Promise<ServiceResult<ProductMedia>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO product_media
          (product_id, media_type, url, alt_text, sort_order, is_primary, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.product_id,
          input.media_type,
          input.url,
          input.alt_text || null,
          input.sort_order ?? 0,
          input.is_primary ?? false,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      return createSuccessResult(mapMedia(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create product media:', error);
      return createErrorResult('Failed to create product media');
    }
  }

  async listMedia(filters?: {
    product_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<ProductMedia[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = 'SELECT * FROM product_media WHERE 1=1';

      if (filters?.product_id) {
        sql += ` AND product_id = $${++paramCount}`;
        params.push(filters.product_id);
      }

      sql += ' ORDER BY is_primary DESC, sort_order ASC, created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapMedia);
    } catch (error) {
      Logger.error('Failed to list product media:', error);
      return [];
    }
  }

  async updateMedia(
    mediaId: string,
    updates: UpdateProductMediaInput
  ): Promise<ServiceResult<ProductMedia>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (updates.media_type !== undefined) {
        updateFields.push(`media_type = $${++paramCount}`);
        values.push(updates.media_type);
      }
      if (updates.url !== undefined) {
        updateFields.push(`url = $${++paramCount}`);
        values.push(updates.url);
      }
      if (updates.alt_text !== undefined) {
        updateFields.push(`alt_text = $${++paramCount}`);
        values.push(updates.alt_text);
      }
      if (updates.sort_order !== undefined) {
        updateFields.push(`sort_order = $${++paramCount}`);
        values.push(updates.sort_order);
      }
      if (updates.is_primary !== undefined) {
        updateFields.push(`is_primary = $${++paramCount}`);
        values.push(updates.is_primary);
      }
      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${++paramCount}`);
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push('updated_at = NOW()');
      values.push(mediaId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE product_media
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Media not found');
      }

      return createSuccessResult(mapMedia(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update product media:', error);
      return createErrorResult('Failed to update product media');
    }
  }

  async getCurrentPrice(
    variantId: string,
    atDate: Date = new Date()
  ): Promise<PriceHistory | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM price_history
         WHERE product_variant_id = $1
           AND starts_at <= $2
           AND (ends_at IS NULL OR ends_at > $2)
         ORDER BY starts_at DESC
         LIMIT 1`,
        [variantId, atDate]
      );
      return result.rows.length > 0 ? mapPriceHistory(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch current price:', error);
      return null;
    }
  }

  async getCurrentPriceForCurrency(params: {
    variantId: string;
    currency: string;
    atDate?: Date;
  }): Promise<PriceHistory | null> {
    try {
      const pool = getDatabasePool();
      const atDate = params.atDate ?? new Date();
      const currency = normalizeCurrencyCode(params.currency);
      if (!currency) {
        return null;
      }

      const result = await pool.query(
        `SELECT *
         FROM price_history
         WHERE product_variant_id = $1
           AND starts_at <= $2
           AND (ends_at IS NULL OR ends_at > $2)
           AND UPPER(currency) = $3
         ORDER BY starts_at DESC
         LIMIT 1`,
        [params.variantId, atDate, currency]
      );
      return result.rows.length > 0 ? mapPriceHistory(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch current price for currency:', error);
      return null;
    }
  }

  async listCurrentPricesForCurrency(params: {
    variantIds: string[];
    currency: string;
    atDate?: Date;
  }): Promise<Map<string, PriceHistory>> {
    const priceMap = new Map<string, PriceHistory>();
    if (params.variantIds.length === 0) {
      return priceMap;
    }

    try {
      const pool = getDatabasePool();
      const atDate = params.atDate ?? new Date();
      const currency = normalizeCurrencyCode(params.currency);
      if (!currency) {
        return priceMap;
      }

      const result = await pool.query(
        `SELECT DISTINCT ON (product_variant_id) *
         FROM price_history
         WHERE product_variant_id = ANY($1)
           AND starts_at <= $2
           AND (ends_at IS NULL OR ends_at > $2)
           AND UPPER(currency) = $3
         ORDER BY product_variant_id, starts_at DESC`,
        [params.variantIds, atDate, currency]
      );

      for (const row of result.rows) {
        const price = mapPriceHistory(row);
        priceMap.set(price.product_variant_id, price);
      }
    } catch (error) {
      Logger.error('Failed to list current prices for currency:', error);
    }

    return priceMap;
  }

  async getCurrentPriceWithCurrencyPreference(params: {
    variantId: string;
    preferredCurrency?: string | null;
    fallbackCurrency?: string | null;
    atDate?: Date;
  }): Promise<PriceHistory | null> {
    try {
      const pool = getDatabasePool();
      const atDate = params.atDate ?? new Date();
      const preferred = normalizeCurrencyCode(params.preferredCurrency);
      const fallback = normalizeCurrencyCode(params.fallbackCurrency);

      const result = await pool.query(
        `SELECT *
         FROM price_history
         WHERE product_variant_id = $1
           AND starts_at <= $2
           AND (ends_at IS NULL OR ends_at > $2)
         ORDER BY
           CASE
             WHEN $3::text IS NOT NULL AND UPPER(currency) = $3 THEN 0
             WHEN $4::text IS NOT NULL AND UPPER(currency) = $4 THEN 1
             ELSE 2
           END,
           starts_at DESC
         LIMIT 1`,
        [params.variantId, atDate, preferred, fallback]
      );

      return result.rows.length > 0 ? mapPriceHistory(result.rows[0]) : null;
    } catch (error) {
      Logger.error(
        'Failed to fetch current price with currency preference:',
        error
      );
      return null;
    }
  }
}

export const catalogService = new CatalogService();
