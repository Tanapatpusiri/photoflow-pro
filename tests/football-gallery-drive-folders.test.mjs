import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const repo=process.cwd();
let source=await readFile(repo+'/lib/football-gallery-drive.js','utf8');
source=source.replace("import {db} from './football-gallery-server';",'const db=globalThis.__fg_test_db;');
const start=source.indexOf('async function api('),end=source.indexOf('export const about=',start);
assert(start>=0&&end>start);
source=source.slice(0,start)+'const api=globalThis.__fg_test_api;\n'+source.slice(end);
const settings=new Map([['drive.root_folder','root-1']]);
const events=new Map([['event-a',{title:'14-11-69',slug:'event-id',drive_folder_id:null}]]);
let lock=Promise.resolve(),created=[];
globalThis.__fg_test_db=()=>({
 async query(sql,args){if(sql.startsWith('SELECT value FROM fg_settings')){let v=settings.get(args[0]);return {rowCount:v?1:0,rows:v?[{value:v}]:[]}}throw Error('Unexpected pool query '+sql)},
 async connect(){let release;return {async query(sql,args){
  if(sql==='BEGIN')return {};
  if(sql.includes('FROM fg_events')&&sql.includes('FOR UPDATE')){let prev=lock;lock=new Promise(r=>release=r);await prev;let e=events.get(args[0]);return {rowCount:e?1:0,rows:e?[e]:[]}}
  if(sql.startsWith('UPDATE fg_events')){events.get(args[0]).drive_folder_id=args[1];return {}}
  if(sql.startsWith('SELECT value FROM fg_settings')){let v=settings.get(args[0]);return {rowCount:v?1:0,rows:v?[{value:v}]:[]}}
  if(sql.startsWith('INSERT INTO fg_settings')){settings.set(args[0],args[1]);return {}}
  if(sql==='COMMIT'||sql==='ROLLBACK'){release?.();release=null;return {}}
  throw Error('Unexpected query '+sql)
 },release(){}}}
});
globalThis.__fg_test_api=async (_path,{body})=>{const data=JSON.parse(body);await new Promise(r=>setTimeout(r,2));const id='folder-'+(created.length+1);created.push({id,...data});return {id}};
const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let ids=await Promise.all([mod.ensurePreviewFolder('event-a'),mod.ensurePreviewFolder('event-a'),mod.ensurePreviewFolder('event-a')]);
assert.equal(new Set(ids).size,1);assert.equal(created.length,2);
assert.equal(created[0].name,'14-11-69');assert.deepEqual(created[0].parents,['root-1']);
assert.equal(created[1].name,'ภาพตัวอย่าง');assert.deepEqual(created[1].parents,[created[0].id]);
assert.equal(created[1].appProperties.fgRole,'previews');
console.log('PASS: event naming, preview hierarchy, and concurrent folder reuse');
