import {NextResponse} from 'next/server';
import {privateHeaders} from '../../../../../lib/football-gallery-server';
import {readGalleryEvent} from '../../../../../lib/football-gallery-event';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
 const {slug}=await params;
 const {data,status}=await readGalleryEvent(request,slug);
 return NextResponse.json(data,{status,headers:privateHeaders});
}
