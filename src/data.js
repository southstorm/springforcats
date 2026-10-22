import {upgradeSiteDesign} from '../shared/design.js';
import {upgradeCapsulePacks} from '../shared/capsules.js';
import {seedCatalog} from '../shared/seed.js';
import {validateCatalog,catalogWithInventory,quoteBag} from '../shared/catalog.js';
export const isPreview=Boolean(window.SPRING_PREVIEW);
let demo;
if(isPreview){try{demo=JSON.parse(localStorage.getItem('spring-admin-demo-v2'));}catch{}if(!demo?.draft||!demo?.live)demo={draft:structuredClone(seedCatalog),live:structuredClone(seedCatalog),revision:1,publishedRevision:1,uploads:{},inventory:Object.fromEntries(seedCatalog.products.flatMap(p=>p.options.map(o=>[o.sku,{sku:o.sku,quantity:30,revision:1}]))),orders:[],settings:{ordersEnabled:true,notificationsEnabled:false,notificationEmail:'',fromEmail:''},settingsRevision:1};}
if(isPreview){const draft=upgradeSiteDesign(upgradeCapsulePacks(demo.draft)),live=upgradeSiteDesign(upgradeCapsulePacks(demo.live));const draftChanged=JSON.stringify(draft)!==JSON.stringify(demo.draft),liveChanged=JSON.stringify(live)!==JSON.stringify(demo.live);if(draftChanged||liveChanged){demo={...demo,draft,live,revision:demo.revision+(draftChanged?1:0),publishedRevision:demo.publishedRevision+(liveChanged?1:0)};try{localStorage.setItem('spring-admin-demo-v2',JSON.stringify(demo));}catch{}}}
export const imageUrl=path=>isPreview?(demo.uploads[path]||window.SPRING_ASSETS?.[path]||path):path;
function persist(next){try{localStorage.setItem('spring-admin-demo-v2',JSON.stringify(next));}catch{throw Error('This browser has no room to save the demo. Try a smaller image or clear the demo’s saved data.');}demo=next;}
const inventory=()=>Object.fromEntries(Object.entries(demo.inventory).map(([sku,row])=>[sku,row.quantity]));
const conflict=message=>{const error=Error(message);error.status=409;return error;};
export async function api(path,{method='GET',data,headers={}}={}){
 if(!isPreview){const response=await fetch(path,{method,credentials:'same-origin',headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});let result;try{result=await response.json();}catch{throw Error('The server could not be reached. Please try again.');}if(!response.ok){const error=Error(result.error||'The request failed.');error.status=response.status;throw error;}return result;}
 if(path==='/api/catalog')return {revision:demo.publishedRevision,catalog:catalogWithInventory(demo.live,inventory()),ordersEnabled:demo.settings.ordersEnabled};
 if(path==='/api/bag/quote')return quoteBag(demo.live,data.items,inventory());
 if(path==='/api/admin/session'||path==='/api/admin/login')return {email:'Offline demo'};
 if(path==='/api/admin/logout')return {ok:true};
 if(path==='/api/admin/catalog'&&method==='GET')return structuredClone({revision:demo.revision,publishedRevision:demo.publishedRevision,catalog:demo.draft});
 if(path==='/api/admin/catalog'&&method==='PUT'){
  if(data.revision!==demo.revision)throw conflict('Reload the demo draft before saving again.');
  const catalog=validateCatalog(data.catalog);persist({...demo,draft:catalog,revision:demo.revision+1});return {revision:demo.revision,catalog:structuredClone(catalog)};
 }
 if(path==='/api/admin/publish'){
  if(data.revision!==demo.revision)throw conflict('Reload the demo draft before publishing.');
  const stock={...demo.inventory};for(const p of demo.draft.products)for(const o of p.options)if(!stock[o.sku])stock[o.sku]={sku:o.sku,quantity:0,revision:1};
  persist({...demo,live:structuredClone(demo.draft),inventory:stock,publishedRevision:demo.revision});return {revision:demo.publishedRevision};
 }
 if(path==='/api/admin/inventory'&&method==='GET')return {items:structuredClone(Object.values(demo.inventory))};
 if(path==='/api/admin/inventory'&&method==='PUT'){
  const row=demo.inventory[data.sku];if(!row||row.revision!==data.revision)throw conflict('Stock changed. Reload inventory.');if(!Number.isInteger(data.quantity)||data.quantity<0||data.quantity>1000000)throw Error('Stock must be a whole number from 0 to 1,000,000.');const next={...row,quantity:data.quantity,revision:row.revision+1};persist({...demo,inventory:{...demo.inventory,[data.sku]:next}});return next;
 }
 if(path==='/api/admin/settings'&&method==='GET')return {revision:demo.settingsRevision,catalog:structuredClone(demo.settings),emailConfigured:false};
 if(path==='/api/admin/settings'&&method==='PUT'){if(data.revision!==demo.settingsRevision)throw conflict('Reload settings.');persist({...demo,settings:structuredClone(data.catalog),settingsRevision:demo.settingsRevision+1});return {revision:demo.settingsRevision,catalog:demo.settings,emailConfigured:false};}
 if(path==='/api/admin/orders')return {orders:structuredClone([...demo.orders].reverse())};
 if(path==='/api/orders'){
  if(!demo.settings.ordersEnabled)throw Error('Order requests are not open yet.');
  const requestKey=headers['Idempotency-Key'];const prior=demo.orders.find(o=>o.requestKey===requestKey);if(prior)return {number:prior.number,totalCents:prior.totalCents,status:prior.status};
  if(!data.customer?.name?.trim()||!data.customer?.email?.includes('@')||!data.customer?.address?.trim())throw Error('Name, email and address are required.');
  const quote=quoteBag(demo.live,data.items,inventory());if(!quote.available||!quote.lines.length)throw conflict('Review the items and available stock in your bag.');if(quote.totalCents!==data.expectedTotalCents)throw conflict('Prices changed. Review your bag.');
  if(demo.live.content.waiver.trim()&&!data.waiverAccepted)throw Error('Please accept the waiver.');
  const stock=structuredClone(demo.inventory);for(const line of quote.lines){stock[line.sku].quantity-=line.units*line.quantity;stock[line.sku].revision++;}
  const id=demo.orders.length+1,createdAt=new Date().toISOString();const order={id,number:`DEMO-${String(id).padStart(4,'0')}`,requestKey,createdAt,status:'new',customer:data.customer,lines:quote.lines,totalCents:quote.totalCents,email:{status:'pending',attempts:0},events:[{createdAt,status:'new'}]};persist({...demo,inventory:stock,orders:[...demo.orders,order]});return {number:order.number,totalCents:order.totalCents,status:order.status};
 }
 const orderPath=path.match(/^\/api\/admin\/orders\/(\d+)\/(status|retry-email)$/);
 if(orderPath){const next=structuredClone(demo),order=next.orders.find(o=>o.id===Number(orderPath[1]));if(!order)throw Error('Order not found.');if(orderPath[2]==='retry-email')throw Error('Email is not sent from the offline demo.');
  if(order.status===data.status)return order;const allowed={new:['confirmed','cancelled'],confirmed:['fulfilled','cancelled'],fulfilled:[],cancelled:[]};if(!allowed[order.status].includes(data.status))throw Error('That status change is not allowed.');
  if(data.status==='cancelled')for(const line of order.lines){next.inventory[line.sku].quantity+=line.units*line.quantity;next.inventory[line.sku].revision++;}order.status=data.status;order.events.push({createdAt:new Date().toISOString(),status:data.status});persist(next);return order;
 }
 if(path==='/api/admin/uploads'){
  const ext=data.data.match(/^data:image\/(png|jpeg|webp|avif);base64,/)?.[1];if(!ext)throw Error('Choose a PNG, JPEG, WebP, or AVIF image.');
  const url=`/uploads/demo-${crypto.randomUUID()}.${ext==='jpeg'?'jpg':ext}`;persist({...demo,uploads:{...demo.uploads,[url]:data.data}});return {url};
 }
 throw Error('This action is not available in the offline demo.');
}
