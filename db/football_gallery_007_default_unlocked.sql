-- New albums are open by default only after an admin completes the existing
-- privacy review and publication workflow. Existing locked albums remain unchanged.
ALTER TABLE fg_events ALTER COLUMN locked SET DEFAULT false;
