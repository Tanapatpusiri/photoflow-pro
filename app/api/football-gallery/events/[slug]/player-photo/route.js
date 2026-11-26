import {NextResponse} from 'next/server';
import {configured,db,grantFor,isUuid,privateHeaders,publicLimitOk} from '../../../../../../lib/football-gallery-server';
import {PLAYER_CONSENT_JOIN,VISIBLE_PLAYER_SQL} from '../../../../../../lib/football-gallery-player-visibility';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const unavailable=(status=404)=>new NextResponse(null,{status,headers:privateHeaders});

export async function GET(request,{params}){
 const {slug}=await params;
 const playerId=request.nextUrl.searchParams.get('player');
 if(!configured()||!isUuid(playerId)||typeof slug!=='string'||slug.length>140)return unavailable();
 try{
  const {rows:[event]}=await db().query("SELECT id FROM fg_events WHERE slug=$1 AND status='published'",[slug]);
  if(!event)return unavailable();
  const grant=await grantFor(request,event.id);
  if(!grant)return unavailable();
  if(!await publicLimitOk(request,grant,'preview'))return unavailable(429);
  const {rows:[profile]}=await db().query(`SELECT r.profile_jpeg FROM fg_players p
   JOIN fg_player_registry r ON r.id=p.registry_id AND r.active=true
   ${PLAYER_CONSENT_JOIN}
   WHERE p.id=$1 AND p.event_id=$2 AND ${VISIBLE_PLAYER_SQL} AND r.profile_jpeg IS NOT NULL`,[playerId,event.id]);
  if(!profile)return unavailable();
  return new NextResponse(profile.profile_jpeg,{headers:{...privateHeaders,'Content-Type':'image/jpeg'}});
 }catch(err){console.error('fg player photo',err?.code||'unknown');return unavailable(503)}
}
