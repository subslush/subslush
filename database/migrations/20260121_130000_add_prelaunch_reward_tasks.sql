-- Description: Add task tracking for pre-launch reward claims.

CREATE TABLE IF NOT EXISTS prelaunch_reward_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_perk_id UUID REFERENCES user_perks(id) ON DELETE SET NULL,
    referral_reward_id UUID REFERENCES referral_rewards(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    reward_tier VARCHAR(50),
    free_months INTEGER NOT NULL CHECK (free_months > 0),
    product_name VARCHAR(150),
    variant_name VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT prelaunch_reward_tasks_status_check CHECK (status IN ('pending', 'issue', 'delivered'))
);

CREATE INDEX IF NOT EXISTS idx_prelaunch_reward_tasks_status
  ON prelaunch_reward_tasks(status);
CREATE INDEX IF NOT EXISTS idx_prelaunch_reward_tasks_user_id
  ON prelaunch_reward_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_prelaunch_reward_tasks_subscription_id
  ON prelaunch_reward_tasks(subscription_id);
CREATE INDEX IF NOT EXISTS idx_prelaunch_reward_tasks_created_at
  ON prelaunch_reward_tasks(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prelaunch_reward_tasks_user_perk_id
  ON prelaunch_reward_tasks(user_perk_id);
