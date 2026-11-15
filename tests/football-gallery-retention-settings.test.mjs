import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const helperSource=await readFile('lib/football-gallery-retention-settings.js','utf8');
const helper=await import('data:text/javascript;base64,'+Buffer.from(helperSource).toString('base64'));
let role='owner',stored=null,queries=[],audits=[];
const client={async query(sql,args){queries.push(sql);if(['BEGIN','COMMIT','ROLLBACK',helper.RETENTION_SETTINGS_LOCK].includes(sql))return {rowCount:0,rows:[]};if(sql.startsWith('SELECT value FROM fg_settings'))return stored===null?{rowCount:0,rows:[]}:{rowCount:1,rows:[{value:stored}]};if(sql.startsWith('INSERT INTO fg_settings')){stored=args[1];return {rowCount:1,rows:[]}}throw Error('unexpected query')},release(){}};
globalThis.__retentionSettingsTest={db:()=>({query:(...a)=>client.query(...a),connect:async()=>client}),adminGuard:async()=>({admin:{id:'owner',role}}),reply:(body,status=200)=>({body,status}),audit:async(_c,a)=>audits.push(a),...helper};
let source=await readFile('app/api/football-gallery/admin/retention-settings/route.js','utf8');source=source.replace(/^import .*;\n/gm,'');source='const {db,adminGuard,reply,audit,RETENTION_MONTHS_KEY,RETENTION_SETTINGS_LOCK,readRetentionMonths}=globalThis.__retentionSettingsTest;\n'+source;
const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const req=months=>({json:async()=>({months})});
let result=await route.GET({});assert.deepEqual(result.body,{months:12,canEdit:true});
role='admin';queries=[];result=await route.POST(req(6));assert.equal(result.status,403);assert.equal(queries.length,0);
result=await route.GET({});assert.equal(result.body.canEdit,false);
role='owner';for(const value of [0,13,1.5,'6',null]){queries=[];result=await route.POST(req(value));assert.equal(result.status,400);assert.equal(queries.length,0)}
stored='broken';result=await route.GET({});assert.equal(result.status,503);assert.equal(result.body.invalid,true);assert.equal(result.body.canEdit,true);
queries=[];result=await route.POST(req(6));assert.equal(result.status,200);assert.equal(stored,'6');assert.ok(queries.includes(helper.RETENTION_SETTINGS_LOCK));assert.equal(audits.at(-1).detail.previousMonths,null);
assert.ok(!queries.some(sql=>/UPDATE\s+fg_events/i.test(sql)));
result=await route.GET({});assert.equal(result.body.months,6);
assert.equal(helper.parseRetentionMonths('06'),null);assert.equal(helper.parseRetentionMonths('12'),12);
console.log('PASS: owner-only configurable 1–12 month setting, default, validation and invalid-setting recovery');
