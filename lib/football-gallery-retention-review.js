// Album dates are Thai calendar dates and the database runs in UTC, so "today" is taken in
// Bangkok time; the database's own current date would keep albums open until 07:00 in Thailand.
export const TODAY_SQL="(NOW() AT TIME ZONE 'Asia/Bangkok')::date";
// The events table must be aliased as e. This only classifies records; it never changes or deletes them.
export const RETENTION_REVIEW_REASON_SQL=`CASE
 WHEN e.event_date IS NULL THEN 'missing_event_date'
 WHEN e.retention_until IS NULL AND (e.status IN ('published','suspended') OR (e.event_date + INTERVAL '1 year')::date < ${TODAY_SQL}) THEN 'missing_retention'
 WHEN e.retention_until > (e.event_date + INTERVAL '1 year')::date THEN 'invalid_retention'
 WHEN LEAST(e.retention_until,(e.event_date + INTERVAL '1 year')::date) < ${TODAY_SQL} THEN 'expired'
 WHEN LEAST(e.retention_until,(e.event_date + INTERVAL '1 year')::date) <= ${TODAY_SQL} + 30 THEN 'upcoming'
 ELSE NULL END`;
