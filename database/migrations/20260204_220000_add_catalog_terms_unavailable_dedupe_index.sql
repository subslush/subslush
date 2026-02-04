-- Migration: Add dedupe index for catalog terms unavailable tasks
-- Created: 2026-02-04T22:00:00.000Z
-- Description: Ensures only one open catalog_terms_unavailable admin task exists at a time.

-- Up Migration
BEGIN;

-- Close duplicates if they somehow exist already (keep newest open)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM admin_tasks
  WHERE task_category = 'catalog_terms_unavailable'
    AND completed_at IS NULL
)
UPDATE admin_tasks
SET completed_at = NOW(),
    notes = COALESCE(notes, '') ||
      '\n[auto] Closed duplicate catalog_terms_unavailable task during migration.'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_tasks_catalog_terms_unavailable_open
  ON admin_tasks(task_category)
  WHERE task_category = 'catalog_terms_unavailable'
    AND completed_at IS NULL;

COMMIT;

-- Down Migration
BEGIN;

DROP INDEX IF EXISTS idx_admin_tasks_catalog_terms_unavailable_open;

COMMIT;
