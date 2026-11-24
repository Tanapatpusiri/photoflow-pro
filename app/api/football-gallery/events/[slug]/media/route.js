import {NextResponse} from 'next/server';
import {db,configured,grantFor,isUuid,privateHeaders,PUBLIC_LIMIT_MESSAGE} from '../../../../../../lib/football-gallery-server';
import {listGalleryMedia} from '../../../../../../lib/football-gallery-media';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(request,{params}){
 if(!configured())return reply({message:'ระบบยังไม่พร้อม'},503);
 try{
  const {slug}=await params;
  const event=await db().query("SELECT id FROM fg_events WHERE slug=$1 AND status='published'",[slug]);
  if(!event.rowCount)return reply({message:'ไม่พบอัลบั้ม'},404);
  const id=event.rows[0].id;
  const grant=await grantFor(request,id);
  if(!grant)return reply({message:'ไม่มีสิทธิ์',needsAccess:true},403);
  const u=new URL(request.url),kind=u.searchParams.get('kind'),player=u.searchParams.get('player'),page=Math.max(1,Math.min(100000,Number(u.searchParams.get('page'))||1));
  if(kind&&!['photo','video'].includes(kind))return reply({message:'ประเภทไฟล์ไม่ถูกต้อง'},400);
  if(player&&!isUuid(player))return reply({message:'ข้อมูลนักฟุตบอลไม่ถูกต้อง'},400);
  const data=await listGalleryMedia(request,{id,grant,kind,player,page});
  return data?reply(data):reply({message:PUBLIC_LIMIT_MESSAGE},429);
 }catch(err){console.error('fg media list',err?.code||'unknown');return reply({message:'ไม่สามารถโหลดรายการรูป'},503)}
}
