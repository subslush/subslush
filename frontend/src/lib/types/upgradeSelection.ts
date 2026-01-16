import type { UpgradeOptions } from './subscription.js';

export type UpgradeSelectionType = 'upgrade_new_account' | 'upgrade_own_account';

export interface UpgradeSelection {
  subscription_id: string;
  order_id?: string | null;
  selection_type?: UpgradeSelectionType | null;
  account_identifier?: string | null;
  manual_monthly_acknowledged_at?: string | null;
  submitted_at?: string | null;
  locked_at?: string | null;
  reminder_24h_at?: string | null;
  reminder_48h_at?: string | null;
  auto_selected_at?: string | null;
  upgrade_options_snapshot: UpgradeOptions;
  created_at: string;
  updated_at: string;
}

export interface UpgradeSelectionSubmission {
  selection_type: UpgradeSelectionType;
  account_identifier?: string | null;
  credentials?: string | null;
  manual_monthly_acknowledged?: boolean;
}

export interface UpgradeSelectionResponse {
  selection: UpgradeSelection;
  locked: boolean;
}
