export const RETENTION_MONTHS_KEY='retention.period_months';
export const RETENTION_MONTHS_DEFAULT=12;
export const RETENTION_SETTINGS_LOCK="SELECT pg_advisory_xact_lock(hashtext('football_gallery_retention_period'))";
export function parseRetentionMonths(value){
 if(typeof value!=='string'||!/^(?:[1-9]|1[0-2])$/.test(value))return null;
 return Number(value);
}
export async function readRetentionMonths(client){
 const result=await client.query('SELECT value FROM fg_settings WHERE key=$1',[RETENTION_MONTHS_KEY]);
 if(!result.rowCount)return RETENTION_MONTHS_DEFAULT;
 const months=parseRetentionMonths(result.rows[0].value);
 if(months===null)throw Error('INVALID_RETENTION_SETTING');
 return months;
}
