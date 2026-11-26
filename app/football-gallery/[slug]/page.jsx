import {cookies} from 'next/headers';
import EventExperience from './event-client';
import {GET as readEvent} from '../../api/football-gallery/events/[slug]/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata={title:'Private Album · Football Gallery',robots:{index:false,follow:false}};

export default async function PrivateEventPage({params,searchParams}){
 const {slug}=await params;
 const {date}=await searchParams;
 let initialData=null;
 try{
  // Read authorized metadata from the same server-side handler as the API.
  // No browser hydration -> public-code POST -> second GET waterfall.
  const response=await readEvent({cookies:await cookies()},{params:Promise.resolve({slug})});
  if(response.ok)initialData=await response.json();
 }catch(err){console.error('fg event SSR',err?.code||'unknown')}
 return <EventExperience slug={slug} initialData={initialData} matchdayDate={typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null}/>;
}
