import EventExperience from './event-client';
export const dynamic='force-dynamic';
export const metadata={title:'Private Album · Football Gallery',robots:{index:false,follow:false}};
export default async function PrivateEventPage({params}){const {slug}=await params;return <EventExperience slug={slug}/>}