export function productUnitType(p){
 if(['capsule','vial','item'].includes(p.unitType))return p.unitType;
 if(p.category==='vials')return 'vial';
 if(/^capsule-\d+$/.test(p.id)||(p.category==='oral'&&/\bcapsules?\b/i.test(p.name)&&!/\bkit\b/i.test(p.name)))return 'capsule';
 return 'item';
}
export const unitNoun=(p,count)=>productUnitType(p)==='capsule'?(count===1?'capsule':'capsules'):productUnitType(p)==='vial'?(count===1?'vial':'vials'):(count===1?'item':'items');
// Preserve physical SKUs, stock counts, custom text and historical order snapshots.
// Only legacy single-capsule options are converted; pack prices are never multiplied twice.
export function upgradeCapsulePacks(input){
 const catalog=structuredClone(input);
 for(const p of catalog.products){
  const legacy=!p.unitType;p.unitType=productUnitType(p);
  if(legacy&&p.unitType==='capsule'&&p.options.length===1&&p.options[0].units===1){
   const option=p.options[0];p.optionType='bundle';
   p.options=[{...option,id:'pack-10',label:'Pack of 10 capsules',units:10,priceCents:option.priceCents*10}];
   p.note=p.note.replace(/\s*·?\s*per capsule/i,' per capsule');
   if(!/pack of 10/i.test(p.note))p.note=p.note?p.note+' · pack of 10':'Pack of 10 capsules';
   if(!/packs? of 10/i.test(p.description))p.description+=' Sold in packs of 10 capsules.';
  }
 }
 return catalog;
}
