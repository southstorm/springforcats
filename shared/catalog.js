import {productUnitType} from './capsules.js';
export const categories = {vials:'Vials',oral:'Oral care',kits:'Starter kits'};
export const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const effectivePrice = (p,o) => p.promo.enabled ? Math.round(o.priceCents*(100-p.promo.percent)/100) : o.priceCents;
export const optionAvailable = (p,o) => p.published && p.inStock && o.inStock;
export const escapeHtml = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateCatalog(data){
 const fail=m=>{throw new Error(m);};
 if(!data||typeof data!=='object'||!data.content||!Array.isArray(data.products))fail('A content section and product list are required.');
 const text=(v,label,max=3000,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(`${label} must be ${required?'non-empty ':''}text, up to ${max} characters.`);return v.trim();};
 const bool=(v,label)=>{if(typeof v!=='boolean')fail(`${label} must be on or off.`);return v;};
 const id=(v,label)=>{if(typeof v!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(v))fail(`${label} must contain only lowercase letters, numbers, and hyphens.`);return v;};
 const image=(v,label)=>{if(typeof v!=='string'||!/^\/(images|uploads)\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|avif)$/.test(v))fail(`${label} must be a site image or an uploaded image.`);return v;};
 const fields={announcement:160,heroEyebrow:100,heroTitle:160,heroText:1000,heroAlt:300,shopTitle:160,shopText:1000,storyTitle:160,storyText:3000,storyExtra:3000,closingTitle:160,promoBannerText:160,waiver:15000,terms:15000,refundPolicy:15000};
 const content={};for(const [key,max]of Object.entries(fields))content[key]=text(data.content[key],key,max,!['waiver','terms','refundPolicy','storyExtra'].includes(key));
 content.heroImage=image(data.content.heroImage,'Hero image');
 if(!Array.isArray(data.content.faqs)||data.content.faqs.length>30)fail('Use up to 30 questions.');
 content.faqs=data.content.faqs.map(f=>({question:text(f.question,'Question',300,true),answer:text(f.answer,'Answer',3000,true)}));
 if(data.products.length>500)fail('Use up to 500 products.');
 const seen=new Set(),skuOwners=new Map();
 const products=data.products.map(p=>{
  if(!p||typeof p!=='object')fail('Invalid product.');
  const productId=id(p.id,'Product ID');if(seen.has(productId))fail('Product IDs must be unique.');seen.add(productId);
  if(!Object.hasOwn(categories,p.category))fail('Choose a valid category.');
  const unitType=productUnitType(p);if(p.unitType!==undefined&&!['capsule','vial','item'].includes(p.unitType))fail('Choose a valid physical unit type.');
  if(!['none','flavor','bundle'].includes(p.optionType))fail('Choose a valid option type.');
  if(!p.promo||!Number.isInteger(p.promo.percent)||p.promo.percent<0||p.promo.percent>99)fail('Promo discount must be a whole number from 0 to 99.');
  const promo={enabled:bool(p.promo.enabled,'Promotion'),label:text(p.promo.label,'Promo label',80,true),percent:p.promo.percent};
  if(!Array.isArray(p.options)||p.options.length<1||p.options.length>20)fail('Each product needs 1–20 purchase options.');
  if(p.optionType==='none'&&p.options.length!==1)fail('A product without variants needs exactly one purchase option.');
  const optionIds=new Set();
  const options=p.options.map(o=>{
   const optionId=id(o.id,'Option ID');if(optionIds.has(optionId))fail('Option IDs must be unique within a product.');optionIds.add(optionId);
   if(!Number.isInteger(o.priceCents)||o.priceCents<1||o.priceCents>10000000)fail('Prices must be between $0.01 and $100,000.00.');
   if(!Number.isInteger(o.units)||o.units<1||o.units>100)fail('Units per option must be 1–100.');
   if(p.optionType!=='bundle'&&o.units!==1)fail('Only bundle options can contain more than one unit.');
   if(typeof o.sku!=='string'||!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(o.sku))fail('SKU must use uppercase letters, numbers, dots, underscores, or hyphens.');
   const owner=skuOwners.get(o.sku);if(owner&&(owner.productId!==productId||p.optionType!=='bundle'))fail('Each flavor/product needs its own SKU. Only bundles of the same product can share a SKU.');
   skuOwners.set(o.sku,{productId});
   return {sku:o.sku,id:optionId,label:text(o.label,'Option name',100,true),units:o.units,priceCents:o.priceCents,inStock:bool(o.inStock,'Option stock')};
  });
  if(p.optionType==='bundle'&&new Set(options.map(o=>o.sku)).size!==1)fail('All bundles of a product must share one physical SKU.');
  if(unitType==='capsule'&&(p.optionType!=='bundle'||options.length!==1||options[0].units!==10))fail('Capsule products must have one purchase option: a pack of 10 capsules.');
  return {unitType,id:productId,name:text(p.name,'Product name',160,true),category:p.category,description:text(p.description,'Description',5000,true),note:text(p.note,'Short detail',300),image:image(p.image,'Product image'),published:bool(p.published,'Product visibility'),inStock:bool(p.inStock,'Product stock'),optionType:p.optionType,promo,options};
 });
 return {content,products};
}
export function publicCatalog(catalog){return {content:catalog.content,products:catalog.products.filter(p=>p.published)};}
export function quoteBag(catalog,items,inventory=null){
 if(!Array.isArray(items)||items.length>100)throw Error('A bag can contain up to 100 lines.');
 const keys=new Set();let totalCents=0;
 const lines=items.map(item=>{
  if(!item||typeof item.productId!=='string'||typeof item.optionId!=='string'||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)throw Error('Each bag quantity must be a whole number from 1 to 99.');
  const key=`${item.productId}:${item.optionId}`;if(keys.has(key))throw Error('Duplicate bag lines are not allowed.');keys.add(key);
  const p=catalog.products.find(p=>p.id===item.productId&&p.published),o=p?.options.find(o=>o.id===item.optionId);
  if(!p||!o)return {...item,error:'This option is no longer available.'};
  if(!optionAvailable(p,o))return {...item,error:'This option is out of stock.'};
  const unitPriceCents=effectivePrice(p,o),lineTotalCents=unitPriceCents*item.quantity;totalCents+=lineTotalCents;
  return {...item,name:p.name,optionLabel:o.label,sku:o.sku,unitType:p.unitType,units:o.units,unitPriceCents,lineTotalCents};
 });
 if(inventory){const demand=new Map();for(const l of lines)if(!l.error)demand.set(l.sku,(demand.get(l.sku)||0)+l.units*l.quantity);for(const l of lines)if(!l.error&&(inventory[l.sku]||0)<demand.get(l.sku)){l.error='Not enough stock is available for these options.';totalCents-=l.lineTotalCents;}}
 return {currency:'USD',lines,totalCents,available:lines.every(l=>!l.error)};
}

export function catalogWithInventory(catalog,inventory){const copy=structuredClone(publicCatalog(catalog));for(const p of copy.products)for(const o of p.options){o.availableQuantity=Math.floor((inventory[o.sku]||0)/o.units);o.inStock=o.inStock&&o.availableQuantity>0;}return copy;}
