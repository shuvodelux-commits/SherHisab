-- Additive follow-up because migration 012 may already be applied.
ALTER TABLE sales_invoices
  ADD COLUMN source_draft_id UUID,
  ADD COLUMN source_draft_version INTEGER,
  ADD CONSTRAINT sales_invoice_draft_source_pair_check CHECK (
    (source_draft_id IS NULL AND source_draft_version IS NULL)
    OR (source_draft_id IS NOT NULL AND source_draft_version > 0)
  );

CREATE UNIQUE INDEX sales_invoice_one_per_draft_idx
  ON sales_invoices (tenant_id, source_draft_id)
  WHERE source_draft_id IS NOT NULL;
