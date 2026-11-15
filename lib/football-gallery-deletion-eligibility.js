// Events are accessed as alias e. Legacy albums keep the original one-year
// waiting period; a shorter owner setting is snapshotted on newly published albums.
export const DELETION_ELIGIBLE_SQL=`e.event_date IS NOT NULL AND e.retention_until IS NOT NULL
 AND e.retention_until>e.event_date
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)>e.event_date
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)<=(e.event_date+INTERVAL '1 year')::date
 AND e.retention_until<=COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)
 AND e.retention_until<CURRENT_DATE
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)<CURRENT_DATE`;
