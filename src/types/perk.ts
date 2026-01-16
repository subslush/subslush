export type PerkSourceType = 'pre_launch_reward' | 'referral_reward';
export type PerkRewardType = 'pre_launch' | 'email_reward' | 'purchase_reward';

export interface UserPerk {
  id: string;
  user_id: string;
  source_type: PerkSourceType;
  source_id: string;
  reward_type: PerkRewardType;
  tier?: string | null;
  applies_to?: string | null;
  free_months?: number | null;
  founder_status?: boolean | null;
  prize_won?: string | null;
  notes?: string | null;
  awarded_at?: Date | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
}
