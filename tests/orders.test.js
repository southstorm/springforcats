import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.js';
import {openStore} from '../server/store.js';
const customer={name:'Test Customer',email:'customer@example.test',phone:'',address:'123 Test Lane, Test City',notes:'A test request'};
test('stock reservation, concurrent bundle orders, idempotency, cancellation and durable email outbox',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'spring-orders-'));let calls=[];let shouldFail=true;
 const app=createApp({dataDir:dir,emailConfigured:()=>true,sendEmail:async payload=>{calls.push(payload);if(shouldFail)throw Error('Test provider unavailable');return {id:'mock-provider-id'};}});
 for(const row of app.store.listInventory())app.store.setStock(row.sku,5,row.revision);
 const setting=app.store.settings();app.store.saveSettings({...setting.catalog,ordersEnabled:true},setting.revision);
 app.store.createOwner('owner@example.test','test-only-password-42');await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 async function call(path,{data,key}={}){const res=await fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{})},body:data?JSON.stringify(data):undefined});return {status:res.status,body:await res.json()};}
 try{
  const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'test-only-password-42'})});cookie=login.headers.get('set-cookie').split(';')[0];
  const input={items:[{productId:'vial-10',optionId:'pack-3',quantity:1}],customer,expectedTotalCents:12000,waiverAccepted:false};
  const results=await Promise.all([call('/api/orders',{data:input,key:'test-concurrent-111111'}),call('/api/orders',{data:input,key:'test-concurrent-222222'})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);const winner=results.findIndex(r=>r.status===201);const created=results[winner].body;assert.equal(app.store.inventory()['VIAL-10'],2,'bundle of three deducts three units');assert.equal(app.store.listOrders().length,1);assert.equal(calls.length,0,'email disabled by default');
  const repeated=await call('/api/orders',{data:input,key:winner===0?'test-concurrent-111111':'test-concurrent-222222'});assert.equal(repeated.status,201);assert.equal(repeated.body.number,created.number);assert.equal(app.store.inventory()['VIAL-10'],2,'retry cannot reserve twice');
  const tampered=await call('/api/orders',{data:{...input,expectedTotalCents:1},key:winner===0?'test-concurrent-111111':'test-concurrent-222222'});assert.equal(tampered.status,409);
  const id=app.store.listOrders()[0].id;
  const current=app.store.settings();app.store.saveSettings({ordersEnabled:true,notificationsEnabled:true,notificationEmail:'orders@example.test',fromEmail:'shop@example.test'},current.revision);await app.processEmails();assert.equal(calls.length,1);assert.equal(app.store.getOrder(id).email.status,'failed');assert.equal(calls[0].to,'orders@example.test');assert.equal(calls[0].order.lines[0].units,3);
  shouldFail=false;app.store.retryEmail(id);await app.processEmails();assert.equal(calls.length,2);assert.equal(app.store.getOrder(id).email.status,'sent');await app.processEmails();assert.equal(calls.length,2,'sent notification must not be delivered twice');
  assert.equal((await call(`/api/admin/orders/${id}/status`,{data:{status:'confirmed'}})).status,200);assert.equal(app.store.inventory()['VIAL-10'],2);
  assert.equal((await call(`/api/admin/orders/${id}/status`,{data:{status:'cancelled'}})).status,200);assert.equal(app.store.inventory()['VIAL-10'],5);
  await call(`/api/admin/orders/${id}/status`,{data:{status:'cancelled'}});assert.equal(app.store.inventory()['VIAL-10'],5,'cancelling twice must not inflate stock');
  assert.equal((await call(`/api/admin/orders/${id}/status`,{data:{status:'fulfilled'}})).status,400);
  assert.equal((await call('/api/orders',{data:{...input,expectedTotalCents:1},key:'tampered-price-333333'})).status,409);assert.equal(app.store.inventory()['VIAL-10'],5,'failed request must not reserve stock');
  const mixed={...input,items:[{productId:'vial-10',optionId:'pack-3',quantity:1},{productId:'vial-10',optionId:'pack-5',quantity:1}],expectedTotalCents:32000};assert.equal((await call('/api/orders',{data:mixed,key:'mixed-bundles-444444'})).status,409,'shared SKU demand must be summed across different bundles');assert.equal(app.store.inventory()['VIAL-10'],5);
  const bag=(await call('/api/bag/quote',{data:{items:[{productId:'suspension',optionId:'chicken',quantity:1},{productId:'suspension',optionId:'tuna',quantity:1}]}})).body;assert.equal(bag.available,true);assert.equal(bag.totalCents,14000);assert.notEqual(bag.lines[0].sku,bag.lines[1].sku);
  await new Promise(r=>app.server.close(r));app.store.close();const reopened=openStore(dir);assert.equal(reopened.getOrder(id).status,'cancelled');assert.equal(reopened.getOrder(id).email.status,'sent');assert.equal(reopened.inventory()['VIAL-10'],5);assert.equal(reopened.settings().catalog.notificationEmail,'orders@example.test');reopened.close();
 }finally{if(app.server.listening){await new Promise(r=>app.server.close(r));app.store.close();}rmSync(dir,{recursive:true,force:true});}
});
