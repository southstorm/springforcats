import './style.css';
import './admin.css';
import './bold.css';
import {unitNoun} from '../shared/capsules.js';
import {api,isPreview,imageUrl} from './data.js';
import {money,effectivePrice,optionAvailable,escapeHtml as esc,categories} from '../shared/catalog.js';
import {mountAdmin,bindAdmin,canLeaveAdmin} from './admin.js';
let ordersEnabled=false,orderRequestKey,orderPayload,orderExpectedTotal,orderSubmitting=false;
let catalog,products=[],category='all',query='',toastTimer,bag=[],quote=null,quoteError='',quoteSequence=0,lastHash='',adminActive=false;
const grid=document.querySelector('#products'),bagDialog=document.querySelector('#bag-dialog'),productDialog=document.querySelector('#product-dialog');
const policyDialog=document.querySelector('#policy-dialog'),orderDialog=document.querySelector('#order-dialog');
const key=item=>`${item.productId}:${item.optionId}`;
const arrow='<svg class="arrow-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15 15 4M4 4h11v11"/></svg>';
try{const saved=JSON.parse(localStorage.getItem('spring-bag-v2')||'[]');if(Array.isArray(saved))for(const item of saved.slice(0,100))if(item&&typeof item.productId==='string'&&typeof item.optionId==='string'&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=99&&!bag.some(i=>key(i)===key(item)))bag.push({productId:item.productId,optionId:item.optionId,quantity:item.quantity});}catch{}
function setText(selector,value){const el=document.querySelector(selector);if(el)el.textContent=value;}
function applyContent(){
 const c=catalog.content;
 setText('.announcement',c.announcement);setText('.hero-copy>.eyebrow',c.heroEyebrow);
 const words=c.heroTitle.trim().split(' ');document.querySelector('#hero-title').innerHTML=words.length>1?`${esc(words.slice(0,-1).join(' '))} <em>${esc(words.at(-1))}</em>`:esc(c.heroTitle);
 setText('.hero-copy>p',c.heroText);const hero=document.querySelector('.hero-photo');hero.src=imageUrl(c.heroImage);hero.alt=c.heroAlt;
 setText('.shop h1',c.shopTitle);setText('.shop .section-heading>p',c.shopText);
 setText('.approach-copy h2',c.storyTitle);const paragraphs=document.querySelectorAll('.approach-copy>p');paragraphs[0].textContent=c.storyText;paragraphs[1].textContent=c.storyExtra;
 setText('.closing h2',c.closingTitle);
 document.querySelector('.faq-list').innerHTML=c.faqs.map(f=>`<details><summary>${esc(f.question)}<span>+</span></summary><p>${esc(f.answer)}</p></details>`).join('');
 document.querySelector('#policy-links').innerHTML=[['waiver','Waiver'],['terms','Terms & conditions'],['refundPolicy','Refund policy']].filter(([k])=>c[k].trim()).map(([k,label])=>`<button class="policy-button" data-policy="${k}">${label}</button>`).join('');
 const promos=products.filter(p=>p.promo.enabled&&p.inStock&&p.options.some(o=>o.inStock));const banner=document.querySelector('#promo-banner');banner.hidden=!promos.length||adminActive;banner.innerHTML=`<span>${esc(c.promoBannerText)}</span><strong>Explore featured products ${arrow}</strong>`;
 for(const b of document.querySelectorAll('[data-filter]')){const value=b.dataset.filter;const count=products.filter(p=>value==='all'||p.category===value).length;b.innerHTML=`${value==='all'?'All essentials':categories[value]}${value==='all'?` <span>${count}</span>`:''}`;}
 setText('.preview-label',isPreview?'Offline demo · no real orders or emails':ordersEnabled?'Order requests available · payment arranged separately':'Order requests coming soon');
}
function renderProducts(){
 const selected=products.filter(p=>(category==='all'||(category==='promotions'?p.promo.enabled:p.category===category))&&`${p.name} ${p.note}`.toLowerCase().includes(query));
 grid.innerHTML=selected.length?selected.map(p=>{
  const min=Math.min(...p.options.map(o=>effectivePrice(p,o))),base=Math.min(...p.options.map(o=>o.priceCents)),available=p.inStock&&p.options.some(o=>o.inStock);
  return `<article class="product-card"><button class="product-image" data-detail="${p.id}" aria-label="View ${esc(p.name)}"><span class="product-tag">${esc(categories[p.category].toUpperCase())}</span>${p.promo.enabled?`<span class="promo-badge">${esc(p.promo.label)}${p.promo.percent>0?` · −${p.promo.percent}%`: ''}</span>`:''}<img src="${esc(imageUrl(p.image))}" alt="${esc(p.name)}" loading="lazy"><span class="view-product">Take a closer look</span></button><div class="product-info"><div><button class="product-name" data-detail="${p.id}">${esc(p.name)}</button><p>${esc(p.note)}</p>${p.unitType==='capsule'?'<p class="option-hint">Pack of 10 capsules</p>':p.options.length>1?`<p class="option-hint">${p.optionType==='bundle'?'Single & bundle options':p.options.map(o=>esc(o.label)).join(' / ')}</p>`:''}</div><span class="price">${p.options.length>1?'<small>From </small>':''}${p.promo.enabled&&p.promo.percent>0?`<del>${money(base)}</del> `:''}<span>${money(min)}</span>${p.unitType==='capsule'?'<small>per pack of 10</small>':''}</span></div><button class="add-button" ${available?(p.options.length>1?`data-detail="${p.id}"`:`data-add="${p.id}" data-option-id="${p.options[0].id}"`):'disabled'}>${available?(p.options.length>1?'Choose options':'Add to bag'):'Out of stock'} <span>${available?'+':'—'}</span></button></article>`;
 }).join(''):'<div class="no-results"><h3>No essentials found.</h3><p>Try another search or category.</p><button id="reset-search" class="button primary">Show all essentials</button></div>';
 setText('#result-status',`${selected.length} products shown`);
 const notice=document.querySelector('#promotion-filter-note');if(notice)notice.remove();if(category==='promotions')grid.insertAdjacentHTML('beforebegin','<p id="promotion-filter-note" class="promotion-filter-note">Showing promotional products. <button id="reset-search" class="admin-text-button">View all essentials</button></p>');
}
function notify(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2800);}
function saveBag(){try{localStorage.setItem('spring-bag-v2',JSON.stringify(bag));}catch{notify('Your browser could not save this bag. It will last for this visit only.');}quote=null;renderBag();refreshQuote();}
async function refreshQuote(){
 const sequence=++quoteSequence;
 try{const result=await api('/api/bag/quote',{method:'POST',data:{items:bag}});if(sequence!==quoteSequence)return;quote=result;quoteError='';renderBag();}catch(e){if(sequence!==quoteSequence)return;quote=null;quoteError='We couldn’t confirm current prices and availability. Please try again.';renderBag();}
}
function add(id,optionId){
 const p=products.find(p=>p.id===id),o=p?.options.find(o=>o.id===optionId);if(!p||!o||!optionAvailable(p,o)){notify('This option is out of stock.');return;}
 const existing=bag.find(i=>i.productId===id&&i.optionId===optionId);if(Number.isInteger(o.availableQuantity)&&(existing?.quantity||0)>=o.availableQuantity){notify('No more stock is available for this option.');return;}if(existing){if(existing.quantity>=99){notify('You can add up to 99 of each option.');return;}existing.quantity++;}else{if(bag.length>=100){notify('Your bag can hold up to 100 different options.');return;}bag.push({productId:id,optionId,quantity:1});}
 saveBag();const message=`${p.name}${p.options.length>1?' · '+o.label:''} added to your bag`;notify(message);setText('#detail-feedback',message);
}
function renderBag(){
 const count=bag.reduce((n,i)=>n+i.quantity,0);setText('#bag-count',count);setText('#drawer-count',`(${count})`);
 document.querySelector('#bag-items').innerHTML=bag.length?bag.map(item=>{
  const p=products.find(p=>p.id===item.productId),o=p?.options.find(o=>o.id===item.optionId),line=quote?.lines.find(l=>key(l)===key(item));const error=line?.error||(!p||!o?'This option is no longer available.':!optionAvailable(p,o)?'This option is out of stock.':'');const price=line?.unitPriceCents??(p&&o?effectivePrice(p,o):0);
  return `<article class="bag-item">${p?`<img src="${esc(imageUrl(p.image))}" alt="${esc(p.name)}">`:'<span class="missing-image">—</span>'}<div><h3>${esc(p?.name||'Unavailable product')}</h3><p>${esc(o?.label||item.optionId)}${o?.units>1?` · ${o.units} ${unitNoun(p,o.units)} per ${p.unitType==='capsule'?'pack':'bundle'}`:''}</p><p>${money(price)} each</p>${error?`<p class="bag-line-error">${esc(error)}</p>`:''}<div class="quantity"><button data-change="${esc(key(item))}" data-delta="-1" aria-label="Decrease ${esc(p?.name||'item')} ${esc(o?.label||'')} quantity">−</button><span>${item.quantity}</span><button data-change="${esc(key(item))}" data-delta="1" aria-label="Increase ${esc(p?.name||'item')} ${esc(o?.label||'')} quantity" ${item.quantity>=99||error?'disabled':''}>+</button></div><button class="remove" data-remove="${esc(key(item))}">Remove</button></div><strong>${error?'—':money(line?.lineTotalCents??price*item.quantity)}</strong></article>`;
 }).join(''):'<div class="empty-bag"><span>♡</span><h3>A little room for care.</h3><p>Your bag is empty. Explore the collection to find their essentials.</p><button class="button primary" id="continue-shopping">Explore the collection</button></div>';
 document.querySelector('#bag-bottom').innerHTML=bag.length?`${quoteError?`<p class="bag-line-error" role="alert">${esc(quoteError)} <button id="retry-quote" class="admin-text-button">Try again</button></p>`:''}<div class="subtotal"><span>${quote&&!quote.available?'Available items subtotal':'Subtotal'}</span><strong>${quote?money(quote.totalCents):'Confirming…'}</strong></div><div class="checkout-note"><strong>${ordersEnabled?'Request your items':'Order requests are not open yet.'}</strong><p>${ordersEnabled?'Submitting a request reserves the items. Payment and delivery will be arranged separately.':'Your bag is saved on this device.'}${quote&&!quote.available?' Please remove unavailable items.':''}</p></div>${ordersEnabled?`<button class="button primary" id="open-order-request" ${!quote?.available||!bag.length?'disabled':''}>Request these items ${arrow}</button>`:''}<button class="button ${ordersEnabled?'secondary':'primary'}" id="continue-shopping">Continue exploring ${arrow}</button>`:'';
}
let detailProduct;
function detail(id){
 const p=products.find(p=>p.id===id);if(!p)return;detailProduct=p;
 document.querySelector('#product-detail').innerHTML=`<div class="detail-image"><img src="${esc(imageUrl(p.image))}" alt="${esc(p.name)}"></div><div class="detail-copy"><div class="eyebrow">${esc(categories[p.category].toUpperCase())}</div>${p.promo.enabled?`<span class="detail-promo">${esc(p.promo.label)}${p.promo.percent>0?` · ${p.promo.percent}% off`: ''}</span>`:''}<h2 id="detail-title">${esc(p.name)}</h2><p class="detail-price" id="detail-price"></p><p>${esc(p.description)}</p><p class="detail-note">${esc(p.note)}</p><label class="variant-label" for="product-option">${p.unitType==='capsule'?'Pack size':p.optionType==='flavor'?'Choose a flavor':p.optionType==='bundle'?'Choose a bundle':'Purchase option'}</label><select id="product-option">${p.options.map(o=>`<option value="${o.id}" ${!p.inStock||!o.inStock?'disabled':''}>${esc(o.label)} · ${money(effectivePrice(p,o))}${!p.inStock||!o.inStock?' — Out of stock':''}</option>`).join('')}</select><button class="button primary" id="detail-add">Add to bag <span>+</span></button><p class="small-note">${ordersEnabled?'Order requests available · payment arranged separately.':'Order requests are not open yet.'}</p><p id="detail-feedback" role="status"></p></div>`;
 const select=document.querySelector('#product-option');select.value=p.options.find(o=>optionAvailable(p,o))?.id||p.options[0].id;updateDetail();select.addEventListener('change',updateDetail);productDialog.showModal();
}
function updateDetail(){const p=detailProduct,o=p.options.find(o=>o.id===document.querySelector('#product-option').value)||p.options[0];document.querySelector('#detail-price').innerHTML=`${p.promo.enabled&&p.promo.percent>0?`<del>${money(o.priceCents)}</del> `:''}${money(effectivePrice(p,o))}${o.units>1?` <small>for ${o.units} ${unitNoun(p,o.units)}</small>`:''}`;const button=document.querySelector('#detail-add');button.disabled=!optionAvailable(p,o);button.textContent=button.disabled?'Out of stock':'Add to bag';setText('#detail-feedback','');}
function updateFilters(){document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===category);b.setAttribute('aria-pressed',String(b.dataset.filter===category));});}
function resetSearch(){category='all';query='';document.querySelector('#search').value='';if(location.hash==='#/shop/promotions')location.hash='/shop';updateFilters();renderProducts();}
document.addEventListener('click',e=>{
 const addButton=e.target.closest('[data-add]');if(addButton)add(addButton.dataset.add,addButton.dataset.optionId);
 const detailButton=e.target.closest('[data-detail]');if(detailButton)detail(detailButton.dataset.detail);
 if(e.target.closest('#detail-add'))add(detailProduct.id,document.querySelector('#product-option').value);
 if(e.target.closest('.close-dialog'))e.target.closest('dialog').close();
 const change=e.target.closest('[data-change]');if(change){const item=bag.find(i=>key(i)===change.dataset.change);if(item){item.quantity=Math.max(0,Math.min(99,item.quantity+Number(change.dataset.delta)));bag=bag.filter(i=>i.quantity>0);saveBag();}}
 const remove=e.target.closest('[data-remove]');if(remove){bag=bag.filter(i=>key(i)!==remove.dataset.remove);saveBag();document.querySelector('#bag-dialog .close-dialog').focus();}
 if(e.target.closest('#continue-shopping')){bagDialog.close();if(!location.hash.startsWith('#/shop'))location.hash='/shop';else document.querySelector('#shop').scrollIntoView({behavior:'smooth'});}
 if(e.target.closest('#reset-search'))resetSearch();
 if(e.target.closest('#retry-quote'))refreshQuote();
 if(e.target.closest('#open-order-request'))openOrderRequest();
 const policy=e.target.closest('[data-policy]');if(policy){const titles={waiver:'Waiver',terms:'Terms & conditions',refundPolicy:'Refund policy'};setText('#policy-title',titles[policy.dataset.policy]);setText('#policy-text',catalog.content[policy.dataset.policy]);policyDialog.showModal();}
 if(e.target.closest('#retry-catalog'))loadCatalog();
});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.filter;updateFilters();renderProducts();}));
document.querySelector('#search').addEventListener('input',e=>{query=e.target.value.toLowerCase().trim();renderProducts();});
document.querySelector('#open-bag').addEventListener('click',()=>{bagDialog.showModal();refreshQuote();});
for(const d of [bagDialog,productDialog,policyDialog,orderDialog])d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
setText('#year',new Date().getFullYear());
function route(){
 const hash=window.location.hash;
 const admin=hash.startsWith('#/admin');
 if(adminActive&&!admin&&!canLeaveAdmin()){history.replaceState(null,'',lastHash||'#/admin');return;}
 adminActive=admin;lastHash=hash;
 const shop=hash.startsWith('#/shop');
 document.querySelector('#landing-view').hidden=shop||admin;document.querySelector('#shop-view').hidden=!shop;document.querySelector('#admin-view').hidden=!admin;
 document.querySelector('#open-bag').hidden=admin;
 const shopLink=document.querySelector('nav a');shopLink.classList.toggle('shop-nav-active',shop);
 if(admin){document.title='Your dashboard — Spring for Cats';document.querySelector('#promo-banner').hidden=true;mountAdmin();}
 else if(shop){shopLink.setAttribute('aria-current','page');const requested=hash.split('/')[2];category=['vials','oral','kits','promotions'].includes(requested)?requested:'all';query='';document.querySelector('#search').value='';updateFilters();renderProducts();document.title='The collection — Spring for Cats';}
 else{shopLink.removeAttribute('aria-current');document.title='Spring for Cats — FIP care, made clearer.';}
 if(catalog&&!admin)applyContent();
 const target=!shop&&!admin&&['#our-story','#questions','#how-it-works'].includes(hash)?document.querySelector(hash):null;
 if(target)target.scrollIntoView({behavior:'instant'});else window.scrollTo({top:0,behavior:'instant'});
}
async function loadCatalog(){
 try{const result=await api('/api/catalog');catalog=result.catalog;ordersEnabled=result.ordersEnabled;products=catalog.products;document.querySelector('#store-error').hidden=true;applyContent();renderProducts();renderBag();refreshQuote();return true;}catch(e){const box=document.querySelector('#store-error');box.hidden=false;box.innerHTML='<p>We couldn’t load the current collection. Please try again.</p><button id="retry-catalog" class="button primary">Try again</button>';return false;}
}
bindAdmin();window.addEventListener('hashchange',route);window.addEventListener('catalog-published',loadCatalog);window.addEventListener('focus',()=>{if(!adminActive)loadCatalog();});
route();loadCatalog();

function openOrderRequest(){
 if(!quote?.available||!bag.length)return;
 orderRequestKey=crypto.randomUUID();orderPayload=null;orderExpectedTotal=quote.totalCents;
 document.querySelector('#order-content').innerHTML=`<div class="eyebrow">THEIR LITTLE ESSENTIALS</div><h2 id="order-title">Request your items.</h2><p class="order-explainer">${isPreview?'Offline demo — use sample details. No real order is sent.':'We’ll review your request and contact you to arrange payment and delivery. No payment is taken here.'}</p><div id="order-error" role="alert"></div><form id="order-request-form"><label class="admin-field">Your name<input name="name" autocomplete="name" maxlength="160" required></label><label class="admin-field">Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label class="admin-field">Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="60"></label><label class="admin-field">Delivery address<textarea name="address" autocomplete="street-address" maxlength="1000" required></textarea></label><label class="admin-field">Notes (optional)<textarea name="notes" maxlength="2000"></textarea></label>${catalog.content.waiver.trim()?`<details class="order-waiver"><summary>Read the waiver</summary><p class="plain-text">${esc(catalog.content.waiver)}</p></details><label class="admin-check"><input name="waiverAccepted" type="checkbox" required> I have read and agree to the waiver.</label>`:''}<p class="order-total">Items total <strong>${money(quote.totalCents)}</strong></p><p class="field-help">Shipping costs and payment will be confirmed separately. Stock is reserved when this request is accepted by the website.</p><button type="submit" class="button primary">${isPreview?'Submit demo request':'Submit order request'} ${arrow}</button></form>`;
 bagDialog.close();orderDialog.showModal();
}
document.querySelector('#order-content').addEventListener('submit',async e=>{
 e.preventDefault();if(orderSubmitting)return;if(!orderPayload&&!quote?.available){document.querySelector('#order-error').textContent='Please review current stock and prices in your bag.';return;}
 orderSubmitting=true;const button=e.target.querySelector('button[type="submit"]');button.disabled=true;const data=new FormData(e.target);
 try{
  if(!orderPayload)orderPayload={items:structuredClone(bag),expectedTotalCents:orderExpectedTotal,customer:{name:data.get('name'),email:data.get('email'),phone:data.get('phone'),address:data.get('address'),notes:data.get('notes')},waiverAccepted:data.has('waiverAccepted')};
  const order=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':orderRequestKey},data:orderPayload});
  bag=[];saveBag();document.querySelector('#order-content').innerHTML=`<div class="order-success"><span>♡</span><h2 id="order-title">${isPreview?'Demo request saved.':'Request received.'}</h2><p>Your reference is <strong>${esc(order.number)}</strong>.</p><p>Items total: ${money(order.totalCents)}. Payment has not been collected.</p><p>${isPreview?'Open the Admin dashboard → Orders to see this sample request.':'We’ll contact you about payment and delivery. Please keep your reference number.'}</p><button class="button primary close-dialog">Continue exploring</button></div>`;await loadCatalog();
 }catch(err){document.querySelector('#order-error').textContent=err.message+(err.status===409?' Close this window and review your bag before starting a new request.':'');document.querySelector('#order-error').className='admin-message error';button.disabled=err.status===409;if(err.status!==409&&err.status<500)orderPayload=null;refreshQuote();}
 finally{orderSubmitting=false;}
});
