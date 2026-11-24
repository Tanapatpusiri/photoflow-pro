import {cookies,headers} from 'next/headers';
import EventExperience from './event-client';
import {readGalleryEvent} from '../../../lib/football-gallery-event';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata={title:'Private Album · Football Gallery',robots:{index:false,follow:false}};

export default async function PrivateEventPage({params}){
 const [{slug},requestCookies,requestHeaders]=await Promise.all([params,cookies(),headers()]);
 const {data,status}=await readGalleryEvent(
  {cookies:requestCookies,headers:requestHeaders},slug,{includePhotos:true}
 );
 return <EventExperience key={slug} slug={slug} initialData={status===200?data:null}/>;
}
