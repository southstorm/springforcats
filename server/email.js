import {money} from '../shared/catalog.js';
export function orderEmail(order){return `New order request ${order.number}\n\nStatus: ${order.status}\nCustomer: ${order.customer.name}\nEmail: ${order.customer.email}\nPhone: ${order.customer.phone||'Not supplied'}\nDelivery address:\n${order.customer.address}\n\nItems:\n${order.lines.map(l=>`${l.quantity} × ${l.name} — ${l.optionLabel} [${l.sku}] (${l.units*l.quantity} stock units): ${money(l.lineTotalCents)}`).join('\n')}\n\nItems total: ${money(order.totalCents)} USD\nPayment has not been collected. Shipping and payment must be confirmed separately.\n\nNotes: ${order.customer.notes||'None'}\n\nOpen the owner dashboard to confirm, fulfill, or cancel this request.`;}
export async function resendEmail({to,from,order}){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`spring-order-${order.id}-${order.createdAt}`},body:JSON.stringify({to:[to],from,subject:`New order request ${order.number}`,text:orderEmail(order)}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Email provider returned status ${response.status}. Check the verified sender and provider settings.`);
 const result=await response.json();return {id:result.id};
}
export function emailWorker(store,{sendEmail=resendEmail,emailConfigured=()=>Boolean(process.env.RESEND_API_KEY)}={}){
 let processing=false;
 async function processQueue(){if(processing)return;const settings=store.settings().catalog;if(!settings.notificationsEnabled||!emailConfigured())return;processing=true;try{
  for(const item of store.pendingEmails()){
   try{const result=await sendEmail({to:settings.notificationEmail,from:settings.fromEmail,order:store.getOrder(item.order_id)});store.emailResult(item.order_id,{ok:true,id:result.id});}catch(e){store.emailResult(item.order_id,{ok:false,error:e.message});}
  }
 }finally{processing=false;}}
 return {processQueue,emailConfigured};
}
