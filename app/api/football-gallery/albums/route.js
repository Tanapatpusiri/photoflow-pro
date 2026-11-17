import {NextResponse} from 'next/server';
import {privateHeaders} from '../../../../lib/football-gallery-server';
import {listPublishedAlbums} from '../../../../lib/football-gallery-albums';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(){
 try{return reply({albums:await listPublishedAlbums()})}
 catch(e){console.error('fg albums',e?.code||'unknown');return reply({message:'โหลดอัลบั้มไม่สำเร็จ',albums:[]},503)}
}
