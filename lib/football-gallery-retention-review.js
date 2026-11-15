// The events table must be aliased as e. This only classifies records; it never changes or deletes them.
export const RETENTION_REVIEW_REASON_SQL=`CASE
 WHEN e.event_date IS NULL THEN 'missing_event_date'
 WHEN e.status IN ('published','suspended') AND e.retention_until IS NULL THEN 'missing_retention'
 WHEN e.retention_until > (e.event_date + INTERVAL '1 year')::date THEN 'invalid_retention'
 WHEN LEAST(e.retention_until,(e.event_date + INTERVAL '1 year')::date) < CURRENT_DATE THEN 'expired'
 WHEN LEAST(e.retention_until,(e.event_date + INTERVAL '1 year')::date) <= CURRENT_DATE + 30 THEN 'upcoming'
 ELSE NULL END`;
