import {db,publicLimitOk} from './football-gallery-server';
import {thumbUrl} from './football-gallery-tickets';

const PAGE=36;

// The callers resolve the event and validate its grant before loading media.
export async function listGalleryMedia(request,{id,grant,kind,player,page}){
 if(!await publicLimitOk(request,grant,'list'))return null;
 const inputs=[id];
 let where="m.event_id=$1 AND m.status='published' AND m.publish_allowed=true AND m.metadata_reviewed=true";
 if(kind){inputs.push(kind);where+=` AND m.kind=$${inputs.length}`}
 if(player){inputs.push(player);where+=` AND EXISTS(SELECT 1 FROM fg_media_players mp JOIN fg_players p ON p.id=mp.player_id WHERE mp.media_id=m.id AND p.event_id=$1 AND p.visible=true AND p.id=$${inputs.length})`}
 inputs.push((page-1)*PAGE);
 // Only files that are safe to hand out: verified originals and verified previews.
 const rows=await db().query(`SELECT m.id,m.kind,m.title,m.captured_at,
  COALESCE((SELECT json_agg(json_build_object('id',f.id,'variant',f.variant,'filename',f.original_filename,'bytes',f.size_bytes,'sha256',f.sha256) ORDER BY f.variant) FROM fg_media_files f WHERE f.media_id=m.id AND ((f.variant IN('JPEG','RAW','VIDEO_ORIGINAL') AND f.verified_hash=true) OR (f.variant IN('THUMB','PREVIEW','VIDEO_PREVIEW') AND f.verified_bytes=true))),'[]'::json) AS files,
  (SELECT CASE WHEN f.storage='drive' THEN f.id END FROM fg_media_files f WHERE f.media_id=m.id AND f.variant='THUMB' AND f.verified_bytes=true) AS thumb_drive
  FROM fg_media m WHERE ${where} ORDER BY m.captured_at NULLS LAST,m.title NULLS LAST,m.id LIMIT ${PAGE} OFFSET $${inputs.length}`,inputs);
 const items=rows.rows.map(({thumb_drive,...item})=>thumb_drive?{...item,thumbUrl:thumbUrl(thumb_drive,grant.codeId,id)}:item);
 return {items,hasMore:items.length===PAGE,page};
}
