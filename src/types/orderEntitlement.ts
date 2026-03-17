export type OrderEntitlementStatus =
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'pending';

export interface OrderEntitlement {
  id: string;
  order_id: string;
  order_item_id?: string | null;
  user_id: string;
  status: OrderEntitlementStatus;
  starts_at: Date;
  ends_at: Date;
  duration_months_snapshot?: number | null;
  credentials_encrypted?: string | null;
  mmu_cycle_index?: number | null;
  mmu_cycle_total?: number | null;
  source_subscription_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertOrderEntitlementInput {
  order_id: string;
  order_item_id?: string | null;
  user_id: string;
  status?: OrderEntitlementStatus;
  starts_at: Date;
  ends_at: Date;
  duration_months_snapshot?: number | null;
  credentials_encrypted?: string | null;
  mmu_cycle_index?: number | null;
  mmu_cycle_total?: number | null;
  source_subscription_id?: string | null;
  metadata?: Record<string, any> | null;
}
