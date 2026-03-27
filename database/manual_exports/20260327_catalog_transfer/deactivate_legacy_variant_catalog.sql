-- Deactivate legacy variant-backed catalog entries
-- Safe target: products that have at least one row in product_variants
-- Result: product status -> inactive, variants -> is_active=false, terms -> is_active=false

BEGIN;

WITH legacy_products AS (
  SELECT DISTINCT p.id
  FROM products p
  JOIN product_variants pv ON pv.product_id = p.id
),
legacy_variants AS (
  SELECT pv.id, pv.product_id
  FROM product_variants pv
  JOIN legacy_products lp ON lp.id = pv.product_id
),
deactivated_terms AS (
  UPDATE product_variant_terms pvt
  SET
    is_active = FALSE,
    updated_at = NOW()
  FROM legacy_variants lv
  WHERE pvt.product_variant_id = lv.id
    AND pvt.is_active IS DISTINCT FROM FALSE
  RETURNING pvt.id
),
deactivated_variants AS (
  UPDATE product_variants pv
  SET
    is_active = FALSE,
    updated_at = NOW()
  FROM legacy_products lp
  WHERE pv.product_id = lp.id
    AND pv.is_active IS DISTINCT FROM FALSE
  RETURNING pv.id
),
deactivated_products AS (
  UPDATE products p
  SET
    status = 'inactive',
    updated_at = NOW()
  FROM legacy_products lp
  WHERE p.id = lp.id
    AND p.status IS DISTINCT FROM 'inactive'
  RETURNING p.id
)
SELECT
  (SELECT COUNT(*) FROM legacy_products) AS targeted_products,
  (SELECT COUNT(*) FROM legacy_variants) AS targeted_variants,
  (SELECT COUNT(*) FROM deactivated_products) AS products_updated,
  (SELECT COUNT(*) FROM deactivated_variants) AS variants_updated,
  (SELECT COUNT(*) FROM deactivated_terms) AS variant_terms_updated;

COMMIT;

-- Post-apply verification
SELECT
  COUNT(*) AS active_variant_backed_products
FROM products p
WHERE p.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv.product_id = p.id
  );

SELECT
  COUNT(*) AS active_variants_under_inactive_products
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE p.status = 'inactive'
  AND pv.is_active = TRUE;
