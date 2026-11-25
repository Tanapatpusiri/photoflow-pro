import FootballGallery from './home-client';
import {listPublishedAlbums} from '../../lib/football-gallery-albums';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata={title:'Football Gallery',robots:{index:false,follow:false}};
export const viewport={width:'device-width',initialScale:1,minimumScale:1,maximumScale:1,userScalable:false};

// Send album cards with the initial HTML, not after client hydration + fetch.
// Privacy/retention status is queried on every page request; no persistent cache.
export default async function FootballGalleryPage(){
 let albums=[];
 try{albums=await listPublishedAlbums()}catch(error){console.error('home album SSR',error?.code||'unknown')}
 return <FootballGallery initialAlbums={albums}/>;
}
