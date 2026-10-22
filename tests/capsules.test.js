import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {seedCatalog} from '../shared/seed.js';
import {validateCatalog,quoteBag} from '../shared/catalog.js';
import {openStore} from '../server/store.js';
test('all capsule strengths are ten-packs and single-capsule options cannot be saved',()=>{
 const capsules=seedCatalog.products.filter(p=>p.unitType==='capsule');assert.equal(capsules.length,4);
 assert.deepEqual(capsules.map(p=>p.options[0].priceCents),[6500,4500,2500,1500]);
 for(const p of capsules){assert.equal(p.options.length,1);assert.equal(p.options[0].units,10);assert.equal(p.options[0].id,'pack-10');}
 const invalid=structuredClone(seedCatalog);invalid.products.find(p=>p.unitType==='capsule').options[0].units=1;assert.throws(()=>validateCatalog(invalid),/pack of 10/);
 const invalidMultiple=structuredClone(seedCatalog);const p=invalidMultiple.products.find(p=>p.unitType==='capsule');p.options.push({...p.options[0],id:'pack-20',units:20});assert.throws(()=>validateCatalog(invalidMultiple),/pack of 10/);
});
test('legacy capsule migration preserves stock, custom content and historical orders, and runs once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'spring-capsules-'));let store;
 try{
  store=openStore(dir);const sku=seedCatalog.products.find(p=>p.id==='capsule-48').options[0].sku;const stock=store.listInventory().find(r=>r.sku===sku);store.setStock(sku,37,stock.revision);store.close();store=null;
  const legacy=structuredClone(seedCatalog);legacy.content.heroTitle='Keep my custom headline';for(const p of legacy.products)if(p.unitType==='capsule'){delete p.unitType;p.optionType='none';p.options=[{...p.options[0],id:'standard',label:'Standard',units:1,priceCents:p.options[0].priceCents/10}];p.note='48 mg per capsule';p.description='Keep my custom product description.';p.name='My custom strength '+p.id;}
  const db=new DatabaseSync(join(dir,'spring.sqlite'));for(const name of ['draft','live'])db.prepare('UPDATE documents SET value=?,revision=7 WHERE name=?').run(JSON.stringify(legacy),name);
  const customer={name:'Legacy customer',email:'old@example.test',phone:'',address:'Test address',notes:''};const oldLine={productId:'capsule-48',optionId:'standard',quantity:1,units:1,sku,name:'48 mg oral capsule',optionLabel:'Standard',unitPriceCents:650,lineTotalCents:650};
  db.prepare('INSERT INTO orders(public_id,idempotency_key,request_hash,created_at,status,customer,lines,total_cents,waiver_accepted,waiver_text) VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy-order','legacy-idempotency-key','legacy-hash',new Date().toISOString(),'new',JSON.stringify(customer),JSON.stringify([oldLine]),650,0,'');db.close();
  store=openStore(dir);assert.equal(store.inventory()[sku],37);assert.equal(store.read('live').revision,8);assert.equal(store.read('draft').catalog.content.heroTitle,'Keep my custom headline');
  const updated=store.read('live').catalog.products.find(p=>p.id==='capsule-48');assert.equal(updated.options[0].sku,sku);assert.equal(updated.options[0].priceCents,6500);assert.match(updated.description,/Keep my custom/);assert.equal(store.getOrder(1).lines[0].units,1);
  store.setOrderStatus(1,'cancelled');assert.equal(store.inventory()[sku],38,'legacy cancellation returns the original one capsule');
  const settings=store.settings();store.saveSettings({...settings.catalog,ordersEnabled:true},settings.revision);
  const items=[{productId:'capsule-48',optionId:'pack-10',quantity:2}];assert.equal(quoteBag(store.read('live').catalog,items,store.inventory()).totalCents,13000);
  store.createOrder({items,customer,expectedTotalCents:13000,waiverAccepted:false},'capsule-request-111111');assert.equal(store.inventory()[sku],18,'two ten-packs consume 20 capsules');
  assert.equal(quoteBag(store.read('live').catalog,[{productId:'capsule-48',optionId:'standard',quantity:1}],store.inventory()).available,false,'stale single-capsule bags must not silently convert');
  store.close();store=openStore(dir);assert.equal(store.read('live').revision,8);assert.equal(store.read('live').catalog.products.find(p=>p.id==='capsule-48').options[0].priceCents,6500);assert.equal(store.inventory()[sku],18);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
