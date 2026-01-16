export interface PrelaunchReward {
  id: string;
  source_type: string;
  source_id: string;
  reward_type: string;
  tier?: string | null;
  applies_to?: string | null;
  free_months?: number | null;
  founder_status?: boolean | null;
  prize_won?: string | null;
  notes?: string | null;
  awarded_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface PrelaunchVoucher {
  id: string;
  voucher_type: string;
  scope: string;
  amount?: number | string | null;
  status: string;
  event_date?: string | null;
  issued_at?: string | null;
  redeemed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PrelaunchRaffleEntry {
  id: string;
  raffle_id: string;
  source: string;
  event_date: string;
  count: number;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PrelaunchRewardsResponse {
  rewards: PrelaunchReward[];
  vouchers: PrelaunchVoucher[];
  raffleEntries: PrelaunchRaffleEntry[];
}
