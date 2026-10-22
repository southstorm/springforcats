import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openStore} from './store.js';
import {emailWorker} from './email.js';
import {catalogWithInventory,quoteBag} from '../shared/catalog.js';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon'};
export function createApp({dataDir=process.env.DATA_DIR||join(root,'.data'),production=process.env.NODE_ENV==='production',publicOrigin=process.env.PUBLIC_ORIGIN,sendEmail,emailConfigured}={}){
 const store=openStore(resolve(dataDir));const attempts=new Map(),orderAttempts=new Map();const worker=emailWorker(store,{sendEmail,emailConfigured});
 function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
 async function body(req,max=8*1024*1024){
  if(!req.headers['content-type']?.startsWith('application/json')){const e=Error('Send JSON data.');e.status=415;throw e;}
  let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max){const e=Error('The upload is too large. Use an image under 5 MB.');e.status=413;throw e;}chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('Invalid JSON.');}
 }
 function sessionToken(req){const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('spring_session='));return value?.slice(15)||'';}
 function cookie(value,clear=false){return `spring_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:43200}${production?'; Secure':''}`;}
 async function staticFile(res,base,pathname){
  const file=resolve(base,'.'+pathname);if(!file.startsWith(resolve(base)+sep))return false;
  try{const info=await stat(file);if(!info.isFile())return false;const type=types[extname(file)];if(!type)return false;
   res.writeHead(200,{'Content-Type':type,'Cache-Control':pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});res.end(await readFile(file));return true;
  }catch{return false;}
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const expected=publicOrigin||`http://${req.headers.host}`;
    if(req.headers.origin!==expected)return send(res,403,{error:'This request did not come from the website.'});
   }
   if(path==='/api/health'&&req.method==='GET')return send(res,200,{ok:true});
   if(path==='/api/catalog'&&req.method==='GET'){const r=store.read('live');return send(res,200,{revision:r.revision,catalog:catalogWithInventory(r.catalog,store.inventory()),ordersEnabled:store.settings().catalog.ordersEnabled});}
   if(path==='/api/bag/quote'&&req.method==='POST'){const b=await body(req,100000);return send(res,200,quoteBag(store.read('live').catalog,b.items,store.inventory()));}
   if(path==='/api/orders'&&req.method==='POST'){
    const ip=req.socket.remoteAddress,attempt=orderAttempts.get(ip);if(attempt&&attempt.until>Date.now()&&attempt.count>=10)return send(res,429,{error:'Too many order requests. Please try again later.'});
    if(orderAttempts.size>5000)for(const [key,value]of orderAttempts)if(value.until<Date.now())orderAttempts.delete(key);
    const b=await body(req,100000);const order=store.createOrder(b,req.headers['idempotency-key']);orderAttempts.set(ip,{count:attempt&&attempt.until>Date.now()?attempt.count+1:1,until:Date.now()+600000});
    send(res,201,{number:order.number,totalCents:order.totalCents,status:order.status});worker.processQueue();return;
   }
   if(path==='/api/admin/login'&&req.method==='POST'){
    const b=await body(req,4096);if(typeof b.email!=='string'||b.email.length>254||typeof b.password!=='string'||b.password.length>128)return send(res,400,{error:'Enter your email and password.'});
    const key=req.socket.remoteAddress;const attempt=attempts.get(key);if(attempt&&attempt.until>Date.now()&&attempt.count>=5)return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});
    if(attempts.size>5000)for(const [k,v]of attempts)if(v.until<Date.now())attempts.delete(k);
    const loggedIn=store.login(b.email,b.password);
    if(!loggedIn){attempts.set(key,{count:attempt&&attempt.until>Date.now()?attempt.count+1:1,until:Date.now()+900000});return send(res,401,{error:'Email or password is incorrect.'});}
    attempts.delete(key);res.setHeader('Set-Cookie',cookie(loggedIn.token));return send(res,200,{email:loggedIn.email});
   }
   if(path.startsWith('/api/admin/')){
    const token=sessionToken(req),owner=store.session(token);if(!owner)return send(res,401,{error:'Please sign in to your dashboard.'});
    if(path==='/api/admin/session'&&req.method==='GET')return send(res,200,{email:owner.email});
    if(path==='/api/admin/logout'&&req.method==='POST'){store.logout(token);res.setHeader('Set-Cookie',cookie('',true));return send(res,200,{ok:true});}
    if(path==='/api/admin/catalog'&&req.method==='GET')return send(res,200,{...store.read('draft'),publishedRevision:store.read('live').revision});
    if(path==='/api/admin/catalog'&&req.method==='PUT'){const b=await body(req);if(!Number.isInteger(b.revision))throw Error('A draft revision is required.');return send(res,200,store.save(b.catalog,b.revision));}
    if(path==='/api/admin/publish'&&req.method==='POST'){const b=await body(req,4096);if(!Number.isInteger(b.revision))throw Error('A draft revision is required.');return send(res,200,store.publish(b.revision));}
    if(path==='/api/admin/inventory'&&req.method==='GET')return send(res,200,{items:store.listInventory()});
    if(path==='/api/admin/inventory'&&req.method==='PUT'){const b=await body(req,4096);return send(res,200,store.setStock(b.sku,b.quantity,b.revision));}
    if(path==='/api/admin/settings'&&req.method==='GET')return send(res,200,{...store.settings(),emailConfigured:worker.emailConfigured()});
    if(path==='/api/admin/settings'&&req.method==='PUT'){const b=await body(req,4096);if(!Number.isInteger(b.revision))throw Error('A settings revision is required.');const result=store.saveSettings(b.catalog,b.revision);send(res,200,{...result,emailConfigured:worker.emailConfigured()});worker.processQueue();return;}
    if(path==='/api/admin/orders'&&req.method==='GET')return send(res,200,{orders:store.listOrders()});
    const orderPath=path.match(/^\/api\/admin\/orders\/(\d+)\/(status|retry-email)$/);
    if(orderPath&&req.method==='POST'){
     const id=Number(orderPath[1]);if(orderPath[2]==='status'){const b=await body(req,4096);return send(res,200,store.setOrderStatus(id,b.status));}
     store.retryEmail(id);send(res,200,{ok:true});worker.processQueue();return;
    }
    if(path==='/api/admin/uploads'&&req.method==='POST'){
     const b=await body(req);if(typeof b.data!=='string')throw Error('Choose an image to upload.');
     const m=b.data.match(/^data:image\/(png|jpeg|webp|avif);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw Error('Choose a PNG, JPEG, WebP, or AVIF image.');
     const buffer=Buffer.from(m[2],'base64');if(buffer.length>5*1024*1024||buffer.length<12)throw Error('Use an image under 5 MB.');
     const kind=m[1];const valid=kind==='png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):kind==='jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:kind==='webp'?buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP':buffer.toString('ascii',4,8)==='ftyp'&&['avif','avis'].includes(buffer.toString('ascii',8,12));
     if(!valid)throw Error('The file does not match its image type.');
     const name=`${randomUUID()}.${kind==='jpeg'?'jpg':kind}`;await mkdir(join(dataDir,'uploads'),{recursive:true,mode:0o700});await writeFile(join(dataDir,'uploads',name),buffer,{mode:0o600,flag:'wx'});return send(res,201,{url:`/uploads/${name}`});
    }
   }
   if(path.startsWith('/api/'))return send(res,404,{error:'Not found.'});
   if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed.'});
   if(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|avif)$/.test(path)){if(await staticFile(res,resolve(dataDir),path))return;}
   else if(!path.startsWith('/uploads/')){if(await staticFile(res,join(root,'dist'),path==='/'?'/index.html':path))return;}
   send(res,404,{error:'Not found.'});
  }catch(e){if(res.headersSent){res.end();return;}const status=e.status||400;send(res,status,{error:status>=500?'Something went wrong. Please try again.':e.message});}
 });
 const timer=setInterval(()=>worker.processQueue(),30000);timer.unref();server.on('close',()=>clearInterval(timer));
 return {server,store,processEmails:worker.processQueue};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.env.NODE_ENV==='production'&&!/^https:\/\//.test(process.env.PUBLIC_ORIGIN||''))throw Error('Set PUBLIC_ORIGIN to the HTTPS website origin in production.');
 const app=createApp();const port=Number(process.env.PORT||3001);app.server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Spring backend listening on port ${port}. ${app.store.hasOwner()?'Owner login configured.':'Run npm run admin:create to configure the owner login.'}`));
 const stop=()=>app.server.close(()=>{app.store.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
