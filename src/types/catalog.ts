export type ProductStatus = 'active' | 'inactive';
export type ProductMediaType = 'image' | 'video';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  service_type?: string | null;
  logo_key?: string | null;
  category?: string | null;
  sub_category?: string | null;
  default_currency?: string | null;
  max_subscriptions?: number | null;
  duration_months?: number | null;
  fixed_price_cents?: number | null;
  fixed_price_currency?: string | null;
  status: ProductStatus;
  category_assignments?: ProductCategoryAssignment[];
  sub_category_ids?: string[];
  sub_category_assignments?: ProductSubCategoryAssignment[];
  category_keys?: string[];
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductCategoryAssignment {
  category_key: string;
  category: string;
  is_primary: boolean;
}

export interface ProductSubCategoryAssignment {
  sub_category_id: string;
  category: string;
  sub_category: string;
  sub_category_slug: string;
  is_primary: boolean;
}

export interface ProductSubCategory {
  id: string;
  category: string;
  name: string;
  slug: string;
  product_count?: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  variant_code?: string | null;
  description?: string | null;
  service_plan?: string | null;
  is_active: boolean;
  sort_order: number;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductVariantTerm {
  id: string;
  product_variant_id: string;
  months: number;
  discount_percent?: number | null;
  is_active: boolean;
  is_recommended: boolean;
  sort_order: number;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductLabel {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProductMedia {
  id: string;
  product_id: string;
  media_type: ProductMediaType;
  url: string;
  alt_text?: string | null;
  sort_order: number;
  is_primary: boolean;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface PriceHistory {
  id: string;
  product_variant_id: string;
  price_cents: number;
  currency: string;
  starts_at: Date;
  ends_at?: Date | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
}

export interface FixedProductPriceHistory {
  id: string;
  product_id: string;
  price_cents: number;
  currency: string;
  starts_at: Date;
  ends_at?: Date | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
}

export interface ProductDetail {
  product: Product;
  /** Legacy records are returned read-only for the classic admin UI. */
  variants: ProductVariant[];
  labels: ProductLabel[];
  media: ProductMedia[];
  /** Legacy variant-backed price history. */
  price_history: PriceHistory[];
  fixed_price_history: FixedProductPriceHistory[];
  legacy_compatibility: LegacyCatalogCompatibility;
  variant_terms?: ProductVariantTerm[];
}

export interface LegacyCatalogCompatibility {
  variant_count: number;
  active_variant_count: number;
  term_count: number;
  price_history_count: number;
  subscription_count: number;
  order_item_count: number;
  payment_count: number;
  credit_transaction_count: number;
  fixed_catalog_preferred: boolean;
}

export interface FixedCatalogRecoveryResult {
  product_id: string;
  already_product_only: boolean;
  deactivated_variant_count: number;
  deactivated_variant_ids: string[];
  compatibility: LegacyCatalogCompatibility;
}

export interface CatalogListing {
  product: Product;
  variant: ProductVariant;
}

export interface CreateProductLabelInput {
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
}

export interface UpdateProductLabelInput {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
}

export interface CreateProductMediaInput {
  product_id: string;
  media_type: ProductMediaType;
  url: string;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  metadata?: Record<string, any> | null;
}

export interface UpdateProductMediaInput {
  media_type?: ProductMediaType;
  url?: string;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  metadata?: Record<string, any> | null;
}

export interface ListVariantFilters {
  product_id?: string;
  service_plan?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListVariantTermFilters {
  product_variant_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListPriceHistoryFilters {
  product_variant_id?: string;
  product_id?: string;
  limit?: number;
  offset?: number;
}

export interface ListFixedProductPriceHistoryFilters {
  product_id: string;
  currency?: string;
  limit?: number;
  offset?: number;
}

export interface ListProductSubCategoryFilters {
  category?: string;
  limit?: number;
  offset?: number;
}

export interface CreateProductSubCategoryInput {
  category: string;
  name: string;
  slug?: string | null;
}

export interface CreateProductInput {
  name: string;
  slug: string;
  description?: string | null;
  service_type?: string | null;
  logo_key?: string | null;
  category?: string | null;
  categories?: string[] | null;
  sub_category?: string | null;
  default_currency?: string | null;
  max_subscriptions?: number | null;
  duration_months?: number | null;
  fixed_price_cents?: number | null;
  fixed_price_currency?: string | null;
  status?: ProductStatus;
  sub_category_ids?: string[] | null;
  metadata?: Record<string, any> | null;
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  service_type?: string | null;
  logo_key?: string | null;
  category?: string | null;
  categories?: string[] | null;
  sub_category?: string | null;
  default_currency?: string | null;
  max_subscriptions?: number | null;
  duration_months?: number | null;
  fixed_price_cents?: number | null;
  fixed_price_currency?: string | null;
  status?: ProductStatus;
  sub_category_ids?: string[] | null;
  metadata?: Record<string, any> | null;
}

export interface CreateVariantInput {
  product_id: string;
  name: string;
  variant_code?: string | null;
  description?: string | null;
  service_plan?: string | null;
  is_active?: boolean;
  sort_order?: number;
  metadata?: Record<string, any> | null;
}

export interface CreateVariantTermInput {
  product_variant_id: string;
  months: number;
  discount_percent?: number | null;
  is_active?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  metadata?: Record<string, any> | null;
}

export interface UpdateVariantTermInput {
  months?: number;
  discount_percent?: number | null;
  is_active?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  metadata?: Record<string, any> | null;
}

export interface UpdateVariantInput {
  name?: string;
  variant_code?: string | null;
  description?: string | null;
  service_plan?: string | null;
  is_active?: boolean;
  sort_order?: number;
  metadata?: Record<string, any> | null;
}

export interface CreatePriceHistoryInput {
  product_variant_id: string;
  price_cents: number;
  currency: string;
  starts_at?: Date;
  ends_at?: Date | null;
  metadata?: Record<string, any> | null;
}

export interface SetCurrentFixedProductPriceInput {
  product_id: string;
  duration_months?: number;
  price_cents: number;
  currency: string;
  comparison_price_cents?: number | null;
  starts_at?: Date;
  metadata?: Record<string, any> | null;
}
