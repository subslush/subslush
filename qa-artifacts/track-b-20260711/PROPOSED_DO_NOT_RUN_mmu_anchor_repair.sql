\set ON_ERROR_STOP on

-- PROPOSED ONLY. DO NOT RUN WITHOUT REVIEW.
--
-- This script is intentionally a no-op until:
--   1. the production schema includes subscriptions.delivered_at;
--   2. the corrected diagnostic runs successfully against a fresh copy;
--   3. every repair below is populated from verified delivery evidence; and
--   4. a reviewer explicitly invokes psql with -v apply=true.
--
-- Required pre-flight outside this script:
--   node database/diagnose-mmu-anchors.js > before.json
--
-- Required fixture assertions before approval:
--   * 9b619566... remains unflagged.
--   * a84c8871... is flagged before repair and clean after repair.
--   * abb2499c... remains excluded because it is expired.

\if :{?apply}
\else
  \set apply false
\endif

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

CREATE TEMP TABLE approved_mmu_anchor_repairs (
  subscription_id uuid PRIMARY KEY,
  expected_current_anchor timestamp without time zone NOT NULL,
  repaired_anchor timestamp without time zone NOT NULL,
  evidence_log_id uuid NOT NULL,
  rationale text NOT NULL
) ON COMMIT DROP;

-- Intentionally empty: Track B could not classify the three candidates because
-- the production copy lacks subscriptions.delivered_at. Populate only after
-- the pending schema migration and a successful corrected diagnostic.
--
-- INSERT INTO approved_mmu_anchor_repairs (...) VALUES (...);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'delivered_at'
  ) THEN
    RAISE EXCEPTION 'Required column subscriptions.delivered_at is missing';
  END IF;
END
$$;

-- Dry-run evidence. The repair anchor must be the verified initial delivery
-- timestamp, never a renewal-completion timestamp.
SELECT r.subscription_id,
       s.term_start_at AS current_anchor,
       r.expected_current_anchor,
       r.repaired_anchor,
       e.id AS evidence_log_id,
       e.event_type,
       e.delivery_timestamp,
       r.rationale
FROM approved_mmu_anchor_repairs r
JOIN subscriptions s ON s.id = r.subscription_id
JOIN order_compliance_evidence_logs e ON e.id = r.evidence_log_id
WHERE s.status = 'active'
ORDER BY r.subscription_id;

\if :apply
  DO $$
  BEGIN
    IF (SELECT COUNT(*) FROM approved_mmu_anchor_repairs) = 0 THEN
      RAISE EXCEPTION 'No reviewed repairs were supplied';
    END IF;
  END
  $$;

  UPDATE subscriptions s
  SET term_start_at = r.repaired_anchor,
      updated_at = NOW()
  FROM approved_mmu_anchor_repairs r
  WHERE s.id = r.subscription_id
    AND s.status = 'active'
    AND s.term_start_at = r.expected_current_anchor;

  DO $$
  BEGIN
    IF (SELECT COUNT(*) FROM approved_mmu_anchor_repairs) <> (
      SELECT COUNT(*)
      FROM subscriptions s
      JOIN approved_mmu_anchor_repairs r ON r.subscription_id = s.id
      WHERE s.term_start_at = r.repaired_anchor
    ) THEN
      RAISE EXCEPTION 'Repair count mismatch; rolling back';
    END IF;
  END
  $$;

  COMMIT;
\else
  \echo 'DRY RUN ONLY: rolling back without changes'
  ROLLBACK;
\endif

-- Required post-flight outside this script after an approved apply:
--   node database/diagnose-mmu-anchors.js > after.json
-- Compare before/after and re-run all three fixture assertions above.
