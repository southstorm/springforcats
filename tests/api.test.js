import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.js';
import {openStore} from '../server/store.js';
const email='owner@example.test',password='test-only-password-42';
test('authenticated drafts, promotions, variants, quotes, uploads and persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'spring-api-'));const app=createApp({dataDir:dir});app.store.createOwner(email,password);for(const row of app.store.listInventory())app.store.setStock(row.sku,100,row.revision);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
 let cookie='';
 const request=async(path,{method='GET',data,auth=true,from=origin}={})=>{const res=await fetch(origin+path,{method,headers:{...(data?{'Content-Type':'application/json','Origin':from}:{}),...(auth?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:res.status,body:await res.json(),headers:res.headers};};
 try{
  assert.equal((await request('/api/admin/catalog')).status,401);
  assert.equal((await request('/api/admin/login',{method:'POST',data:{email,password},from:'https://evil.example'})).status,403);
  assert.equal((await request('/api/admin/login',{method:'POST',data:{email,password:'bad'}})).status,401);
  const login=await request('/api/admin/login',{method:'POST',data:{email,password}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  const initial=(await request('/api/catalog')).body;assert.equal(initial.catalog.products.length,9);assert.equal('password' in initial,false);
  let draft=(await request('/api/admin/catalog')).body;const p=draft.catalog.products.find(p=>p.id==='vial-10');p.options.find(o=>o.units===3).priceCents=10000;p.promo={enabled:true,label:'Spring savings',percent:10};
  const suspension=draft.catalog.products.find(p=>p.id==='suspension');suspension.options.find(o=>o.id==='tuna').inStock=false;
  draft.catalog.products.find(p=>p.id==='vial-65').promo={enabled:true,label:'Back in stock',percent:0};
  draft.catalog.content.heroTitle='A private draft headline';draft.catalog.content.terms='Published terms';
  const invalid=structuredClone(draft);invalid.catalog.products[0].options[0].priceCents=-10;
  assert.equal((await request('/api/admin/catalog',{method:'PUT',data:invalid})).status,400);
  const saved=await request('/api/admin/catalog',{method:'PUT',data:draft});assert.equal(saved.status,200);assert.equal(saved.body.revision,2);
  assert.equal((await request('/api/catalog')).body.catalog.content.heroTitle,initial.catalog.content.heroTitle,'draft must not leak');
  assert.equal((await request('/api/admin/catalog',{method:'PUT',data:draft})).status,409,'stale saves rejected');
  assert.equal((await request('/api/admin/publish',{method:'POST',data:{revision:1}})).status,409);
  assert.equal((await request('/api/admin/publish',{method:'POST',data:{revision:2}})).status,200);
  assert.equal((await request('/api/catalog')).body.catalog.content.heroTitle,'A private draft headline');
  const badgeQuote=(await request('/api/bag/quote',{method:'POST',data:{items:[{productId:'vial-65',optionId:'pack-3',quantity:1}]}})).body;assert.equal(badgeQuote.totalCents,6900,'banner-only promotion must keep the original bundle price');
  const quote=await request('/api/bag/quote',{method:'POST',auth:false,data:{items:[{productId:'vial-10',optionId:'pack-3',quantity:2,priceCents:1}]}});assert.equal(quote.status,200);assert.equal(quote.body.totalCents,18000,'server owns discounted bundle price');assert.equal(quote.body.lines[0].units,3);
  const out=await request('/api/bag/quote',{method:'POST',auth:false,data:{items:[{productId:'suspension',optionId:'tuna',quantity:1}]}});assert.equal(out.body.available,false);assert.equal(out.body.totalCents,0);assert.match(out.body.lines[0].error,/out of stock/);
  assert.equal((await request('/api/bag/quote',{method:'POST',data:{items:[{productId:'vial-10',optionId:'pack-3',quantity:-1}]}})).status,400);
  draft=(await request('/api/admin/catalog')).body;draft.catalog.products.find(p=>p.id==='vial-10').published=false;
  await request('/api/admin/catalog',{method:'PUT',data:draft});await request('/api/admin/publish',{method:'POST',data:{revision:3}});
  assert.equal((await request('/api/catalog')).body.catalog.products.some(p=>p.id==='vial-10'),false);
  const gone=(await request('/api/bag/quote',{method:'POST',data:{items:[{productId:'vial-10',optionId:'pack-3',quantity:1}]}})).body;assert.equal(gone.available,false);
  assert.equal((await request('/api/admin/uploads',{method:'POST',data:{data:'data:image/png;base64,'+Buffer.from('not an image at all').toString('base64')}})).status,400);
  assert.equal((await request('/api/admin/uploads',{method:'POST',data:{data:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
  const uploaded=await request('/api/admin/uploads',{method:'POST',data:{data:'data:image/png;base64,'+readFileSync('public/images/hero-cat.png').toString('base64')}});assert.equal(uploaded.status,201);assert.match(uploaded.body.url,/^\/uploads\//);const img=await fetch(origin+uploaded.body.url);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
  assert.equal((await request('/api/admin/catalog',{method:'PUT',data:{...draft,revision:3},from:'https://evil.example'})).status,403);
  await request('/api/admin/logout',{method:'POST',data:{}});assert.equal((await request('/api/admin/catalog')).status,401);
  await new Promise(r=>app.server.close(r));app.store.close();const reopened=openStore(dir);assert.equal(reopened.read('live').revision,3);assert.equal(reopened.read('live').catalog.content.heroTitle,'A private draft headline');assert.equal(reopened.hasOwner(),true);reopened.close();
 }finally{if(app.server.listening){await new Promise(r=>app.server.close(r));app.store.close();}rmSync(dir,{recursive:true,force:true});}
});
test('login attempts are throttled and production session cookies are secure',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'spring-auth-'));const app=createApp({dataDir:dir,production:true,publicOrigin:'https://shop.example.test'});app.store.createOwner(email,password);for(const row of app.store.listInventory())app.store.setStock(row.sku,100,row.revision);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${app.server.address().port}/api/admin/login`;const post=pass=>fetch(url,{method:'POST',headers:{Origin:'https://shop.example.test','Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
  const success=await post(password);assert.equal(success.status,200);assert.match(success.headers.get('set-cookie'),/; Secure/);
  for(let i=0;i<5;i++)assert.equal((await post('wrong')).status,401);
  assert.equal((await post(password)).status,429);
 }finally{await new Promise(r=>app.server.close(r));app.store.close();rmSync(dir,{recursive:true,force:true});}
});
