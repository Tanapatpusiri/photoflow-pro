// Applies the Football Gallery SQL files in order, once each, inside a transaction.
// Usage (dedicated database only, never the PJAA or any other project's database):
//   DATABASE_URL=postgres://... node scripts/migrate-football-gallery.mjs
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';

const files=['db/football_gallery_schema.sql','db/football_gallery_ingestion_extension.sql','db/football_gallery_003_production.sql','db/football_gallery_004_google_drive.sql','db/football_gallery_005_retention_deletion.sql','db/football_gallery_006_public_albums.sql','db/football_gallery_007_default_unlocked.sql','db/football_gallery_008_player_registry.sql','db/football_gallery_009_registry_legacy.sql','db/football_gallery_010_matchdays.sql'];
const {DATABASE_URL}=process.env;
if(!DATABASE_URL){console.error('Set DATABASE_URL for the dedicated Football Gallery database.');process.exit(1)}
const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
const client=await pool.connect();
try{
 await client.query('CREATE TABLE IF NOT EXISTS fg_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of files){
  const sql=await readFile(new URL('../'+name,import.meta.url),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const done=await client.query('SELECT checksum FROM fg_schema_migrations WHERE name=$1',[name]);
  if(done.rowCount){
   if(done.rows[0].checksum!==checksum)console.warn(`WARN ${name} changed after it was applied; review manually, it is not re-run.`);
   else console.log(`skip ${name}`);
   continue;
  }
  await client.query('BEGIN');
  try{
   await client.query(sql);
   await client.query('INSERT INTO fg_schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
   await client.query('COMMIT');
   console.log(`applied ${name}`);
  }catch(e){await client.query('ROLLBACK');throw e}
 }
}catch(e){console.error('Migration failed:',e.code||'',e.message);process.exitCode=1}
finally{client.release();await pool.end()}
