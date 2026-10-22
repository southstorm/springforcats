import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const credentials={email:'owner@example.test',password:'test-only-password-42'};
const origin='http://127.0.0.1:5174';
test.setTimeout(60000);
async function signIn(page){await page.goto('/#/admin');await page.getByRole('textbox',{name:'Email address'}).fill(credentials.email);await page.getByLabel('Password',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'A little room to grow.'})).toBeVisible();}
async function saveProduct(page){await page.getByRole('button',{name:'Save product draft',exact:true}).first().click();await expect(page.locator('#admin-message')).toContainText('Draft saved');}
async function publish(page){await page.getByRole('button',{name:'Publish changes',exact:true}).click();await expect(page.locator('#admin-message')).toContainText('Published.');}
async function reset(request,original){const current=await(await request.get('/api/admin/catalog')).json();const save=await request.put('/api/admin/catalog',{headers:{Origin:origin},data:{revision:current.revision,catalog:original}});expect(save.ok()).toBeTruthy();const result=await save.json();expect((await request.post('/api/admin/publish',{headers:{Origin:origin},data:{revision:result.revision}})).ok()).toBeTruthy();}
test('owner adds a product, previews a draft, publishes promo and stock changes',async({page})=>{
 await signIn(page);const request=page.request;const original=(await(await request.get('/api/admin/catalog')).json()).catalog;
 try{
  await page.getByRole('button',{name:'+ Add product',exact:true}).click();
  await page.getByRole('textbox',{name:'Product name',exact:true}).fill('Care companion kit');
  await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('kits');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('A newly added care kit for the test collection.');
  await page.getByLabel('Price (USD)',{exact:true}).fill('12.50');
  await page.getByLabel('Put this product on promotion').check();await page.getByLabel('Discount (%)',{exact:true}).fill('20');await page.getByLabel('Badge text',{exact:true}).fill('Spring special');
  await page.locator('[data-upload="product"]').setInputFiles({name:'kit.avif',mimeType:'image/avif',buffer:readFileSync('public/images/reference-8.avif')});await expect(page.locator('#admin-message')).toContainText('Photo uploaded');
  await saveProduct(page);
  await page.getByRole('link',{name:'View website',exact:true}).click();await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();await expect(page.locator('.product-card').filter({hasText:'Care companion kit'})).toHaveCount(0);
  await page.getByRole('link',{name:'Admin dashboard'}).click();await publish(page);
  await page.getByRole('button',{name:'Stock by SKU',exact:true}).click();const newRow=page.locator('.stock-form').filter({hasText:'Care companion kit'});await newRow.getByRole('spinbutton').fill('20');await newRow.getByRole('button',{name:'Save stock'}).click();await expect(page.locator('#admin-message')).toContainText('Stock saved');
  await page.getByRole('button',{name:/^Products/}).click();
  await page.getByRole('link',{name:'View website',exact:true}).click();await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();
  const card=page.locator('.product-card').filter({hasText:'Care companion kit'});await expect(card).toContainText('$10.00');await expect(card).toContainText('$12.50');await expect(card.locator('.promo-badge')).toContainText('Spring special');await expect(page.locator('#promo-banner')).toBeVisible();
  await page.locator('#promo-banner').click();await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('link',{name:'Admin dashboard'}).click();await page.locator('.admin-product-row').filter({hasText:'Care companion kit'}).click();await page.getByLabel('Product is in stock',{exact:true}).uncheck();await saveProduct(page);await publish(page);
  await page.getByRole('link',{name:'View website',exact:true}).click();await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();await expect(page.locator('.product-card').filter({hasText:'Care companion kit'}).getByRole('button',{name:'Out of stock'})).toBeDisabled();
 }finally{await reset(request,original).catch(()=>{});}
});
test('owner sets bundle pricing, flavor availability and website text',async({page})=>{
 await signIn(page);const request=page.request;const original=(await(await request.get('/api/admin/catalog')).json()).catalog;
 try{
  await page.locator('.admin-product-row').filter({hasText:'10 mL vial'}).click();
  await page.locator('.option-row').filter({has:page.locator('[data-option="label"][value="Bundle of 3"]')}).getByLabel('Price (USD)').fill('100.00');
  await page.getByLabel('Put this product on promotion').check();await page.getByLabel('Discount (%)',{exact:true}).fill('10');await saveProduct(page);await publish(page);
  await page.getByRole('link',{name:'View website',exact:true}).click();await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();await page.getByRole('button',{name:'View 10 mL vial',exact:true}).click();await page.getByLabel('Choose a bundle').selectOption('pack-3');await expect(page.locator('#detail-price')).toContainText('$90.00');await page.getByRole('dialog').getByRole('button',{name:'Add to bag'}).click();await page.getByRole('button',{name:'Close product details'}).click();await page.getByRole('button',{name:'Open shopping bag'}).click();await expect(page.locator('.subtotal')).toContainText('$90.00');await expect(page.locator('.bag-item')).toContainText('Bundle of 3');await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'Admin dashboard'}).click();await page.locator('.admin-product-row').filter({hasText:'Oral suspension'}).click();const tuna=page.locator('.option-row').filter({has:page.locator('[data-option="label"][value="Tuna"]')});await tuna.getByLabel('In stock',{exact:true}).uncheck();await saveProduct(page);await publish(page);
  await page.getByRole('button',{name:'Website text & images',exact:true}).click();await page.getByRole('textbox',{name:'Homepage headline',exact:true}).fill('A brighter <b>tomorrow</b>.');await page.getByRole('textbox',{name:'Terms & conditions',exact:true}).fill('Our updated terms for the test.');await page.getByRole('button',{name:'Save website draft',exact:true}).first().click();await expect(page.locator('#admin-message')).toContainText('Draft saved');await publish(page);
  await page.getByRole('link',{name:'View website',exact:true}).click();await expect(page.locator('#hero-title')).toHaveText('A brighter <b>tomorrow</b>.');await expect(page.locator('#hero-title b')).toHaveCount(0);
  await page.getByRole('button',{name:'Terms & conditions',exact:true}).click();await expect(page.locator('#policy-text')).toHaveText('Our updated terms for the test.');await page.keyboard.press('Escape');
  await page.locator('.hero').getByRole('link',{name:'Shop the collection'}).click();await page.getByRole('button',{name:'View Oral suspension',exact:true}).click();await expect(page.locator('#product-option option[value="tuna"]')).toBeDisabled();await expect(page.getByLabel('Choose a flavor')).toHaveValue('chicken');
 }finally{await reset(request,original).catch(()=>{});}
});
