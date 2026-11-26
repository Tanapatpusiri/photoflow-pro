import {NextResponse} from 'next/server';
import {db,isUuid,privateHeaders,streamPrivateObject} from '../../../../../lib/football-gallery-server';
import {adminGuard,adminReply as reply} from '../../../../../lib/football-gallery-admin';
import {readDriveMedia} from '../../../../../lib/football-gallery-drive';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
 const {error}=await adminGuard(request);if(error)return error;
 const event=request.nextUrl.searchParams.get('event'),media=request.nextUrl.searchParams.get('media');
 if(!isUuid(event)||!isUuid(media))return reply({message:'ข้อมูลไม่ถูกต้อง'},400);
 try{
  const {rows:[file]}=await db().query(`SELECT f.storage,f.r2_key
   FROM fg_media_files f JOIN fg_media m ON m.id=f.media_id
   JOIN fg_events e ON e.id=m.event_id
   WHERE m.id=$1 AND m.event_id=$2 AND m.kind='photo' AND m.status IN ('review','published')
    AND e.status IN ('draft','published') AND f.variant='THUMB' AND f.verified_bytes=true`,[media,event]);
  if(!file)return reply({message:'ไม่พบรูปสำหรับจัดกลุ่ม'},404);
  const body=file.storage==='drive'?(await readDriveMedia(file.r2_key)).body:(await streamPrivateObject(file.r2_key)).Body?.transformToWebStream();
  if(!body)return reply({message:'โหลดรูปไม่สำเร็จ'},503);
  return new NextResponse(body,{headers:{...privateHeaders,'Content-Type':'image/jpeg'}});
 }catch(err){console.error('fg face preview',err?.code||'unknown');return reply({message:'โหลดรูปไม่สำเร็จ'},503)}
}
