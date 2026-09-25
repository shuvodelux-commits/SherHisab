-- Additive follow-up because migration 012 may already be applied.
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS source_draft_id UUID,
  ADD COLUMN IF NOT EXISTS source_draft_version INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'sales_invoices'::regclass
      AND conname = 'sales_invoice_draft_source_pair_check'
  ) THEN
    ALTER TABLE sales_invoices
      ADD CONSTRAINT sales_invoice_draft_source_pair_check CHECK (
        (source_draft_id IS NULL AND source_draft_version IS NULL)
        OR (source_draft_id IS NOT NULL AND source_draft_version > 0)
      );
  END IF;
END $$;

-- Recover only reciprocal, unambiguous historical links. If multiple posted
-- drafts point at one invoice, leave the source NULL rather than guessing.
WITH unambiguous_links AS (
  SELECT invoice.id AS sale_id, draft.id AS draft_id, draft.version
  FROM sales_invoices invoice
  JOIN sales_drafts draft
    ON draft.tenant_id = invoice.tenant_id
   AND draft.posted_sale_id = invoice.id
   AND draft.posted_operation_id = invoice.operation_id
   AND draft.status = 'POSTED'
  WHERE invoice.operation_id IS NOT NULL
    AND invoice.source_draft_id IS NULL
  GROUP BY invoice.id, draft.id, draft.version
  HAVING (
    SELECT COUNT(*)
    FROM sales_drafts linked
    WHERE linked.tenant_id = invoice.tenant_id
      AND linked.posted_sale_id = invoice.id
  ) = 1
)
UPDATE sales_invoices invoice
SET source_draft_id = link.draft_id,
    source_draft_version = link.version
FROM unambiguous_links link
WHERE invoice.id = link.sale_id
  AND invoice.source_draft_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_one_per_draft_idx
  ON sales_invoices (tenant_id, source_draft_id)
  WHERE source_draft_id IS NOT NULL;
