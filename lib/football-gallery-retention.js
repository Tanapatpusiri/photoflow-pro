// Calendar months clamp to the last day of shorter months, matching PostgreSQL.
export function addRetentionMonths(value,months){
 if(typeof value!=='string')return '';
 if(!Number.isInteger(months)||months<1||months>12)return '';
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
 if(!match)return '';
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '';
 const target=new Date(Date.UTC(year,month-1+months,1));
 const targetYear=target.getUTCFullYear(),targetMonth=target.getUTCMonth()+1;
 const lastDay=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
 return `${String(targetYear).padStart(4,'0')}-${String(targetMonth).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
export const oneYearAfterEvent=value=>addRetentionMonths(value,12);

export function validRetentionDate(eventDate,retention,today,months=12){
 const max=addRetentionMonths(eventDate,months);
 if(!max||typeof retention!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(retention))return false;
 // Validate the calendar date itself, rather than allowing Date.parse normalization.
 if(!oneYearAfterEvent(retention))return false;
 return typeof today==='string'&&retention>today&&retention>String(eventDate).slice(0,10)&&retention<=max;
}

// Album dates are Thai calendar dates and the database runs in UTC, so "today" is taken in
// Bangkok time; the database's own current date would keep albums open until 07:00 in Thailand.
export const TODAY_SQL="(NOW() AT TIME ZONE 'Asia/Bangkok')::date";

// Used only where the events table is aliased as e. Older rows can lack retention
// or contain dates from before this limit existed; those rows must fail closed.
export const ACTIVE_RETENTION_SQL="e.event_date IS NOT NULL AND e.retention_until IS NOT NULL AND e.retention_until>="+TODAY_SQL+" AND e.retention_until<=(e.event_date + INTERVAL '1 year')::date";
