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
  read_at?: Date | null;
  cleared_at?: Date | null;
  created_at: Date;
  order_id?: string | null;
  subscription_id?: string | null;
  dedupe_key: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  orderId?: string | null;
  subscriptionId?: string | null;
  dedupeKey: string;
}

export interface NotificationListResult {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}
