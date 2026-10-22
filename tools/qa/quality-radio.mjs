import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label=process.env.QA_LABEL||'round4',out=path.join(ROOT,'reports/quality',label);fs.mkdirSync(out,{recursive:true})
const sandbox=await createSandbox({port:Number(process.env.QA_PORT||8803),label:label+'-radio'}),browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'}),results=[]
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS',name)}catch(e){results.push({name,status:'failed',error:e.message});console.log('FAIL',name,e.message)}}
try{
 await loginPage(page,sandbox);await page.locator('#settingsBtn').click()
 for(const id of ['themeOptions','densityOptions','fontOptions']){
  const group=page.locator('#'+id),radios=group.locator('[role=radio]'),n=await radios.count()
  await test(id+' single tab stop, arrows wrap, Home/End',async()=>{
   assert.equal(await group.locator('[tabindex="0"]').count(),1)
   await radios.first().click();await page.keyboard.press('End');assert.equal(await radios.last().getAttribute('aria-checked'),'true');assert.equal(await group.locator('[tabindex="0"]').count(),1)
   await page.keyboard.press('ArrowRight');assert.equal(await radios.first().getAttribute('aria-checked'),'true')
   await page.keyboard.press('ArrowUp');assert.equal(await radios.last().getAttribute('aria-checked'),'true')
   await page.keyboard.press('Home');assert.equal(await radios.first().getAttribute('aria-checked'),'true')
  })
 }
 await test('keyboard changes persist after reload',async()=>{
  await page.locator('[data-theme-option="light"]').click();await page.keyboard.press('ArrowRight');await page.locator('button[data-density="comfortable"]').click();await page.keyboard.press('ArrowRight');await page.locator('[data-font="1"]').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.reload();await page.locator('#shell').waitFor({state:'visible'});await page.locator('#settingsBtn').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.locator('button[data-density="compact"]').getAttribute('aria-checked'),'true');assert.equal(await page.locator('[data-font="1.1"]').getAttribute('aria-checked'),'true')
 })
 await test('Tab leaves settings radio group',async()=>{
  await page.locator('[data-theme-option="dark"]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('[role=radiogroup]')?.id),'densityOptions')
 })
 await page.keyboard.press('Escape')
 await test('engine radio has one tab stop and skips disabled controls',async()=>{
  await page.locator('#engineDsr').click();await page.keyboard.press('End')
  const disabled=await page.locator('#engineCodex').isDisabled();assert.equal(await page.locator(disabled?'#engineDsr':'#engineCodex').getAttribute('aria-checked'),'true');assert.equal(await page.locator('#engineBar [role=radio][tabindex="0"]').count(),1)
 })
}finally{await browser.close();await sandbox.stop();fs.writeFileSync(path.join(out,'radio.json'),JSON.stringify({label,results},null,2))}
if(results.some(x=>x.status!=='passed'))process.exitCode=1
