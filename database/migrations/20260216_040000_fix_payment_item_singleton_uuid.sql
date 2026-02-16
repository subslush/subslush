-- Fix enforce_payment_item_singleton() to avoid MIN(uuid) aggregate errors.
-- Uses array_agg to retrieve the single order_item_id when count = 1.

CREATE OR REPLACE FUNCTION enforce_payment_item_singleton()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_id UUID;
  v_item_count INTEGER;
  v_single_item UUID;
  v_payment_item UUID;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_payment_id := NEW.id;
  ELSE
    v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);
  END IF;

  IF v_payment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), (ARRAY_AGG(order_item_id))[1]
  INTO v_item_count, v_single_item
  FROM payment_items
  WHERE payment_id = v_payment_id;

  SELECT order_item_id INTO v_payment_item
  FROM payments
  WHERE id = v_payment_id;

  IF v_item_count > 1 THEN
    IF v_payment_item IS NOT NULL THEN
      RAISE EXCEPTION
        'payments.order_item_id must be NULL when payment has multiple items (payment_id=%)',
        v_payment_id;
    END IF;
  ELSIF v_item_count = 1 THEN
    IF v_payment_item IS DISTINCT FROM v_single_item THEN
      RAISE EXCEPTION
        'payments.order_item_id must match payment_items when single item (payment_id=%)',
        v_payment_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
