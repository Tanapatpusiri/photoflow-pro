// Album dates are Thai calendar dates and the database runs in UTC, so "today" is taken in
// Bangkok time; the database's own current date would keep albums open until 07:00 in Thailand.
export const TODAY_SQL="(NOW() AT TIME ZONE 'Asia/Bangkok')::date";
// Events are accessed as alias e. Legacy albums keep the original one-year
// waiting period; a shorter owner setting is snapshotted on newly published albums.
export const DELETION_ELIGIBLE_SQL=`e.event_date IS NOT NULL AND e.retention_until IS NOT NULL
 AND e.retention_until>e.event_date
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)>e.event_date
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)<=(e.event_date+INTERVAL '1 year')::date
 AND e.retention_until<=COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)
 AND e.retention_until<${TODAY_SQL}
 AND COALESCE(e.deletion_after,(e.event_date+INTERVAL '1 year')::date)<${TODAY_SQL}`;
