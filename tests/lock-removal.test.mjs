import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
test('Retired lock endpoints cannot read or write authentication or push data',async()=>{
 for(const route of ['options','register','verify','recover','status']){
  const response=await worker.fetch(new Request('https://app.test/api/app-lock/'+route,{method:'POST'}),{DB:{prepare(){throw Error('Retired routes must not access storage');}}});
  assert.equal(response.status,405);
 }
});
test('Lock retirement migration removes only lock metadata and preserves reminder subscriptions and delivery state',()=>{
 const db=new DatabaseSync(':memory:');
 for(const file of ['0000_push','0001_app_lock'])db.exec(fs.readFileSync('drizzle/'+file+'.sql','utf8'));
 db.exec("INSERT INTO push_devices (id,subscription,rules,updated_at) VALUES ('synthetic','synthetic','synthetic',1); INSERT INTO push_state (key,value) VALUES ('last_dispatch','1'); INSERT INTO push_deliveries (device_id,occurrence_key,lead_days,state,claim,claim_until) VALUES ('synthetic','synthetic',0,'sent','synthetic',1);");
 db.exec(fs.readFileSync('drizzle/0002_remove_app_lock.sql','utf8'));
 for(const table of ['push_devices','push_deliveries','push_state'])assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'app_lock_%'").get().n,0);db.close();
});
