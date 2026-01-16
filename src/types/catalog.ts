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
  default_currency?: string | null;
  max_subscriptions?: number | null;
  status: ProductStatus;
  metadata?: Record<string, any> | null;
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

export interface ProductDetail {
  product: Product;
  variants: ProductVariant[];
  labels: ProductLabel[];
  media: ProductMedia[];
  price_history: PriceHistory[];
  variant_terms?: ProductVariantTerm[];
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

export interface CreateProductInput {
  name: string;
  slug: string;
  description?: string | null;
  service_type?: string | null;
  logo_key?: string | null;
  category?: string | null;
  default_currency?: string | null;
  max_subscriptions?: number | null;
  status?: ProductStatus;
  metadata?: Record<string, any> | null;
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  service_type?: string | null;
  logo_key?: string | null;
  category?: string | null;
  default_currency?: string | null;
  max_subscriptions?: number | null;
  status?: ProductStatus;
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
