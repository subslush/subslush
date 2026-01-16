export type NotificationType =
  | 'order_delivered'
  | 'order_cancelled'
  | 'subscription_activated'
  | 'subscription_expiring'
  | 'subscription_renewal_failed'
  | 'subscription_renewed'
  | 'upgrade_selection_reminder'
  | 'announcement';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  cleared_at?: string | null;
  created_at: string;
  order_id?: string | null;
  subscription_id?: string | null;
  dedupe_key: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  unread_count: number;
}
