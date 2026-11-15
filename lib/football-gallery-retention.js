// Recommend one calendar year after the event, clamping leap day to February 28.
// An event without a valid date requires an explicit date from the administrator.
export function oneYearAfterEvent(value){
 if(typeof value!=='string')return '';
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
 if(!match)return '';
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '';
 const lastDay=new Date(Date.UTC(year+1,month,0)).getUTCDate();
 return `${String(year+1).padStart(4,'0')}-${match[2]}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
