// File sizes for admin and parent pages: small previews and JPEGs show in KB instead of "0.0 MB".
export function formatBytes(value){
 const n=Math.max(0,Number(value)||0);
 if(n>=999.95e6)return (n/1e9).toFixed(2)+' GB';
 if(n>=999.5e3)return (n/1e6).toFixed(1)+' MB';
 if(n>=1e3)return Math.round(n/1e3)+' KB';
 return Math.round(n)+' B';
}
// EXIF capture times carry no time zone. They are stored as the camera's wall-clock time in a
// UTC-shaped value, so they must be shown in UTC to match what the camera recorded.
export function formatCaptureTime(value){
 if(!value)return '';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'':date.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'});
}
