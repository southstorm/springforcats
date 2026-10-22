import { test, expect } from '@playwright/test';
test('catalogue filters, details and persistent shopping bag',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#/shop');
 await expect(page.locator('.product-card')).toHaveCount(9);
 await page.getByRole('button',{name:'Vials',exact:true}).click();
 await expect(page.locator('.product-card')).toHaveCount(2);
 await page.getByRole('button',{name:'View 10 mL vial',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('20 mg/mL');
 await page.getByRole('dialog').getByRole('button',{name:'Add to bag'}).click();
 await page.getByRole('button',{name:'Close product details'}).click();
 await page.getByRole('button',{name:'Open shopping bag'}).click();
 await expect(page.locator('.subtotal')).toContainText('$40.00');
 await page.getByRole('button',{name:'Increase 10 mL vial Single vial quantity'}).click();
 await expect(page.locator('.subtotal')).toContainText('$80.00');
 await page.reload();
 await expect(page.locator('#bag-count')).toHaveText('2');
 await page.getByRole('button',{name:'Open shopping bag'}).click();
 await page.getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page.locator('.empty-bag')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('searchbox').fill('suspension');
 await expect(page.locator('.product-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('nothing-matches');
 await expect(page.getByText('No essentials found.')).toBeVisible();
 await page.getByRole('button',{name:'Show all essentials'}).click();
 await expect(page.locator('.product-card')).toHaveCount(9);
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.locator('body').evaluate(e=>e.clientWidth));
 expect(errors).toEqual([]);
});
test('images load and page renders',async({page},testInfo)=>{
 await page.goto('/#/shop');
 for(const img of await page.locator('.product-image img').all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);}
 await expect.poll(()=>page.locator('.product-image img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`/tmp/spring-${testInfo.project.name}.png`,fullPage:true});
});

test('landing page leads to the shop and category collections',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#landing-view')).toBeVisible();
 await expect(page.locator('#shop-view')).toBeHidden();
 await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();
 await expect(page).toHaveURL(/#\/shop$/);
 await expect(page.locator('#landing-view')).toBeHidden();
 await expect(page.locator('.product-card')).toHaveCount(9);
 await page.getByRole('link',{name:'Spring for Cats home'}).click();
 await page.locator('.category-card').filter({hasText:'Oral care'}).click();
 await expect(page.locator('.product-card')).toHaveCount(5);
 await expect(page.getByRole('button',{name:'Oral care',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(page.locator('#shop-view')).toBeVisible();
 await expect(page.locator('.product-card')).toHaveCount(5);
 await page.goBack();
 await expect(page.locator('#landing-view')).toBeVisible();
 await page.getByRole('button',{name:'Open shopping bag'}).click();
 await page.getByRole('button',{name:'Explore the collection'}).click();
 await expect(page.locator('#shop-view')).toBeVisible();
});
test('capsules show pack pricing and the bag counts packs of ten',async({page})=>{
 await page.goto('/#/shop');
 for(const [strength,price]of [[48,'$65.00'],[24,'$45.00'],[12,'$25.00'],[6,'$15.00']]){
  const card=page.locator('.product-card').filter({has:page.getByRole('button',{name:`${strength} mg oral capsule`,exact:true})});
  await expect(card).toContainText(price);await expect(card).toContainText('per pack of 10');
 }
 const card=page.locator('.product-card').filter({has:page.getByRole('button',{name:'48 mg oral capsule',exact:true})});await card.getByRole('button',{name:'Add to bag'}).click();await page.getByRole('button',{name:'Open shopping bag'}).click();await expect(page.locator('.bag-item')).toContainText('10 capsules per pack');await expect(page.locator('.bag-item')).not.toContainText('vials');await expect(page.locator('.subtotal')).toContainText('$65.00');
 await page.getByRole('button',{name:'Increase 48 mg oral capsule Pack of 10 capsules quantity'}).click();await expect(page.locator('.subtotal')).toContainText('$130.00');await page.keyboard.press('Escape');await card.getByRole('button',{name:'View 48 mg oral capsule',exact:true}).click();await expect(page.getByLabel('Pack size')).toHaveValue('pack-10');await expect(page.locator('#product-option option')).toHaveCount(1);await expect(page.locator('#detail-price')).toContainText('10 capsules');
});
