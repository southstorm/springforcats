import {randomUUID,createHash} from 'node:crypto';
import {quoteBag} from '../shared/catalog.js';
const emailValid=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const defaultSettings={ordersEnabled:false,notificationsEnabled:false,notificationEmail:'',fromEmail:''};
export function validateSettings(s){if(!s||typeof s.notificationEmail!=='string'||typeof s.fromEmail!=='string')throw Error('Email settings must be text.');if(typeof s.ordersEnabled!=='boolean'||typeof s.notificationsEnabled!=='boolean')throw Error('Choose order and notification settings.');if((s.notificationEmail&&!emailValid(s.notificationEmail))||(s.fromEmail&&!emailValid(s.fromEmail)))throw Error('Enter valid notification and sender email addresses.');if(s.notificationsEnabled&&(!s.notificationEmail||!s.fromEmail))throw Error('Notification and sender addresses are required to enable email.');return {ordersEnabled:s.ordersEnabled,notificationsEnabled:s.notificationsEnabled,notificationEmail:s.notificationEmail.trim(),fromEmail:s.fromEmail.trim()};}
export function orderCustomer(input){
 const text=(v,label,max,required=true)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error(`${label} is required and must be under ${max} characters.`);return v.trim();};
 if(!input||typeof input!=='object')throw Error('Customer details are required.');
 const c={name:text(input.name,'Name',160),email:text(input.email,'Email',254),phone:text(input.phone||'','Phone',60,false),address:text(input.address,'Delivery address',1000),notes:text(input.notes||'','Notes',2000,false)};if(!emailValid(c.email))throw Error('Enter a valid email address.');return c;
}
export function initializeOrders(db){
 db.exec(`CREATE TABLE IF NOT EXISTS inventory(sku TEXT PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity>=0), revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, public_id TEXT UNIQUE NOT NULL, idempotency_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, customer TEXT NOT NULL, lines TEXT NOT NULL, total_cents INTEGER NOT NULL, waiver_accepted INTEGER NOT NULL, waiver_text TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS email_outbox(order_id INTEGER PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, sent_at TEXT, last_error TEXT, provider_id TEXT);
 CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL);`);
 db.prepare("INSERT OR IGNORE INTO documents VALUES('settings',1,?)").run(JSON.stringify(defaultSettings));
}
export function orderStore(db,read){
 const inventory=()=>Object.fromEntries(db.prepare('SELECT sku,quantity FROM inventory').all().map(r=>[r.sku,r.quantity]));
 function syncInventory(catalog){for(const p of catalog.products)for(const o of p.options)db.prepare('INSERT OR IGNORE INTO inventory VALUES(?,0,1)').run(o.sku);}
 function listInventory(){return db.prepare('SELECT * FROM inventory ORDER BY sku').all();}
 function setStock(sku,quantity,revision){if(typeof sku!=='string'||!Number.isInteger(quantity)||quantity<0||quantity>1000000||!Number.isInteger(revision))throw Error('Stock must be a whole number from 0 to 1,000,000.');const r=db.prepare('UPDATE inventory SET quantity=?,revision=revision+1 WHERE sku=? AND revision=?').run(quantity,sku,revision);if(!r.changes){const e=Error('Stock changed while you were editing. Reload inventory and try again.');e.status=409;throw e;}return db.prepare('SELECT * FROM inventory WHERE sku=?').get(sku);}
 function settings(){return read('settings');}
 function saveSettings(input,revision){const clean=validateSettings(input);const r=db.prepare("UPDATE documents SET value=?,revision=revision+1 WHERE name='settings' AND revision=?").run(JSON.stringify(clean),revision);if(!r.changes){const e=Error('Settings changed. Reload before saving.');e.status=409;throw e;}return settings();}
 function parseOrder(row){if(!row)return null;const email=db.prepare('SELECT status,attempts,sent_at,last_error FROM email_outbox WHERE order_id=?').get(row.id);return {id:row.id,number:`SFC-${String(row.id).padStart(6,'0')}`,createdAt:row.created_at,status:row.status,customer:JSON.parse(row.customer),lines:JSON.parse(row.lines),totalCents:row.total_cents,waiverAccepted:!!row.waiver_accepted,email:email||{status:'pending',attempts:0},events:db.prepare('SELECT created_at AS createdAt,status FROM order_events WHERE order_id=? ORDER BY id').all(row.id)};}
 function createOrder(input,idempotencyKey){
  if(typeof idempotencyKey!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(idempotencyKey))throw Error('A unique order request key is required.');
  const customer=orderCustomer(input.customer);if(!Number.isInteger(input.expectedTotalCents)||input.expectedTotalCents<1)throw Error('Confirm the current total before submitting.');
  const requestHash=createHash('sha256').update(JSON.stringify({customer,items:input.items,expectedTotalCents:input.expectedTotalCents,waiverAccepted:input.waiverAccepted})).digest('hex');
  db.exec('BEGIN IMMEDIATE');try{
   const prior=db.prepare('SELECT * FROM orders WHERE idempotency_key=?').get(idempotencyKey);
   if(prior){if(prior.request_hash!==requestHash){const e=Error('This order request key was already used. Refresh the bag to start a new request.');e.status=409;throw e;}db.exec('COMMIT');return parseOrder(prior);}
   if(!settings().catalog.ordersEnabled){const e=Error('Order requests are not open yet.');e.status=403;throw e;}
   const live=read('live').catalog;if(live.content.waiver.trim()&&input.waiverAccepted!==true)throw Error('Please read and accept the waiver before submitting.');
   const quote=quoteBag(live,input.items,inventory());if(!quote.lines.length)throw Error('Your bag is empty.');
   if(!quote.available){const e=Error('Some items are no longer available in the requested quantity. Review your bag.');e.status=409;throw e;}
   if(quote.totalCents!==input.expectedTotalCents){const e=Error('A price changed. Review the new bag total before submitting.');e.status=409;throw e;}
   for(const l of quote.lines){const r=db.prepare('UPDATE inventory SET quantity=quantity-?,revision=revision+1 WHERE sku=? AND quantity>=?').run(l.units*l.quantity,l.sku,l.units*l.quantity);if(!r.changes)throw Error('Stock changed. Review your bag before submitting.');}
   const createdAt=new Date().toISOString();const result=db.prepare('INSERT INTO orders(public_id,idempotency_key,request_hash,created_at,status,customer,lines,total_cents,waiver_accepted,waiver_text) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),idempotencyKey,requestHash,createdAt,'new',JSON.stringify(customer),JSON.stringify(quote.lines),quote.totalCents,input.waiverAccepted===true?1:0,live.content.waiver);
   const id=Number(result.lastInsertRowid);db.prepare("INSERT INTO email_outbox(order_id,status) VALUES(?,'pending')").run(id);db.prepare('INSERT INTO order_events(order_id,created_at,status) VALUES(?,?,?)').run(id,createdAt,'new');
   db.exec('COMMIT');return parseOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function listOrders(){return db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all().map(parseOrder);}
 function getOrder(id){return parseOrder(db.prepare('SELECT * FROM orders WHERE id=?').get(id));}
 function setOrderStatus(id,next){
  const allowed={new:['confirmed','cancelled'],confirmed:['fulfilled','cancelled'],fulfilled:[],cancelled:[]};
  db.exec('BEGIN IMMEDIATE');try{
   const row=db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!row)throw Error('Order not found.');if(row.status===next){db.exec('COMMIT');return getOrder(id);}
   if(!allowed[row.status]?.includes(next))throw Error('That status change is not allowed.');
   if(next==='cancelled')for(const l of JSON.parse(row.lines))db.prepare('UPDATE inventory SET quantity=quantity+?,revision=revision+1 WHERE sku=?').run(l.units*l.quantity,l.sku);
   db.prepare('UPDATE orders SET status=? WHERE id=?').run(next,id);db.prepare('INSERT INTO order_events(order_id,created_at,status) VALUES(?,?,?)').run(id,new Date().toISOString(),next);db.exec('COMMIT');return getOrder(id);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function retryEmail(id){const r=db.prepare("UPDATE email_outbox SET status='pending',attempts=0,next_attempt=0,last_error=NULL WHERE order_id=? AND status!='sent'").run(id);if(!r.changes)throw Error('The notification was already sent or the order does not exist.');}
 function pendingEmails(){return db.prepare("SELECT order_id,attempts FROM email_outbox WHERE status IN ('pending','failed') AND attempts<5 AND next_attempt<=?").all(Date.now());}
 function emailResult(id,result){if(result.ok)db.prepare("UPDATE email_outbox SET status='sent',sent_at=?,provider_id=?,last_error=NULL WHERE order_id=?").run(new Date().toISOString(),result.id||null,id);else{const r=db.prepare('SELECT attempts FROM email_outbox WHERE order_id=?').get(id);db.prepare("UPDATE email_outbox SET status='failed',attempts=attempts+1,next_attempt=?,last_error=? WHERE order_id=?").run(Date.now()+Math.min(3600000,60000*2**r.attempts),result.error,id);}}
 return {inventory,syncInventory,listInventory,setStock,settings,saveSettings,createOrder,listOrders,getOrder,setOrderStatus,retryEmail,pendingEmails,emailResult};
}
