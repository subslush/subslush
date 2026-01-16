import type {
  UpgradeOptionsSnapshot,
  UpgradeSelectionType,
} from './subscription';

export interface UpgradeSelection {
  subscription_id: string;
  order_id?: string | null;
  selection_type?: UpgradeSelectionType | null;
  account_identifier?: string | null;
  credentials_encrypted?: string | null;
  manual_monthly_acknowledged_at?: Date | null;
  submitted_at?: Date | null;
  locked_at?: Date | null;
  reminder_24h_at?: Date | null;
  reminder_48h_at?: Date | null;
  auto_selected_at?: Date | null;
  upgrade_options_snapshot: UpgradeOptionsSnapshot;
  created_at: Date;
  updated_at: Date;
}

export interface UpgradeSelectionSubmission {
  selection_type: UpgradeSelectionType;
  account_identifier?: string | null;
  credentials?: string | null;
  manual_monthly_acknowledged?: boolean;
}
