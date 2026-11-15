-- Football Gallery migration 005: a non-destructive record of an owner's
-- preparation to review a single expired album. This does not authorize or
-- perform deletion. Snapshot counts are informational and must be recalculated
-- before any future deletion confirmation or execution.
CREATE TABLE IF NOT EXISTS fg_retention_deletion_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES fg_events(id),
 prepared_by uuid NOT NULL REFERENCES fg_admins(id),
 state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','cancelled')),
 event_date date NOT NULL,
 retention_until date NOT NULL,
 snapshot jsonb NOT NULL,
 prepared_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz,
 cancelled_by uuid REFERENCES fg_admins(id),
 CHECK ((state='prepared' AND cancelled_at IS NULL AND cancelled_by IS NULL) OR
        (state='cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS fg_retention_one_prepared_review_per_event
 ON fg_retention_deletion_reviews(event_id) WHERE state='prepared';
CREATE INDEX IF NOT EXISTS fg_retention_deletion_reviews_event_idx
 ON fg_retention_deletion_reviews(event_id,prepared_at DESC);
