-- KiranaTrack FK safety migration
-- Changes ON DELETE CASCADE to ON DELETE RESTRICT for financial tables.
-- This prevents accidental hard-deletion of payments and line items when a bill row is deleted.
-- The app uses soft-delete (deleted_at) so CASCADE is never needed.
-- Safe to run multiple times (uses IF EXISTS checks).

-- payments.bill_id: CASCADE → RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_bill_id_fkey'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE public.payments DROP CONSTRAINT payments_bill_id_fkey;
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_bill_id_fkey
      FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- bill_line_items.bill_id: CASCADE → RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bill_line_items_bill_id_fkey'
      AND table_name = 'bill_line_items'
  ) THEN
    ALTER TABLE public.bill_line_items DROP CONSTRAINT bill_line_items_bill_id_fkey;
    ALTER TABLE public.bill_line_items
      ADD CONSTRAINT bill_line_items_bill_id_fkey
      FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- payment_edit_log.payment_id: CASCADE → RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_edit_log_payment_id_fkey'
      AND table_name = 'payment_edit_log'
  ) THEN
    ALTER TABLE public.payment_edit_log DROP CONSTRAINT payment_edit_log_payment_id_fkey;
    ALTER TABLE public.payment_edit_log
      ADD CONSTRAINT payment_edit_log_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- udhaar_entries.customer_id: CASCADE → RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'udhaar_entries_customer_id_fkey'
      AND table_name = 'udhaar_entries'
  ) THEN
    ALTER TABLE public.udhaar_entries DROP CONSTRAINT udhaar_entries_customer_id_fkey;
    ALTER TABLE public.udhaar_entries
      ADD CONSTRAINT udhaar_entries_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.udhaar_customers(id) ON DELETE RESTRICT;
  END IF;
END $$;
