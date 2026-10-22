import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'round3'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8803), label: `${label}-find` })
const browser = await launchBrowser()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const results = []
async function test(name, fn) { try { await fn(); results.push({ name, status: 'passed' }); console.log('PASS',name) } catch(error) { results.push({ name, status:'failed', error:error.message }); console.log('FAIL', name,error.message); await page.screenshot({path:path.join(out,'find-failure.png')}) } }
try {
 await sandbox.api('/api/backup/import',{method:'POST',body:JSON.stringify({conversations:[{title:'Find 160',messages:Array.from({length:160},(_,i)=>({role:i%2?'assistant':'user',text:i===0?'old_unique_needle repeat repeat':i===159?'**repeat** final answer':`Message ${i}`}))}]})})
 const id=(await sandbox.api('/api/conversations')).body.conversations[0].id
 const conv=(await sandbox.api(`/api/conversations/${id}`)).body.conversation
 await loginPage(page,sandbox)
 await page.goto(`${sandbox.base}/c/${id}`);await page.locator('#thread .msg').first().waitFor()
 await test('initial history window is bounded',async()=>assert.equal(await page.locator('#thread .msg').count(),60))
 await test('whole-history find reveals oldest message in bounded window',async()=>{
  await page.keyboard.press('Meta+f');await page.locator('#findInput').fill('old_unique_needle');await page.waitForTimeout(350)
  assert.equal(await page.locator('#findCount').innerText(),'1/1');assert.equal(await page.locator('mark.find-hit.active').innerText(),'old_unique_needle');assert.ok(await page.locator('#thread .msg').count()<=60)
 })
 await test('closing find restores latest bounded messages',async()=>{
  await page.keyboard.press('Escape');assert.equal(await page.locator('#thread .msg').count(),60);assert.match(await page.locator('#thread').innerText(),/final answer/)
 })
 await test('old message deep link reveals target without mounting full history',async()=>{
  await page.goto(`${sandbox.base}/c/${id}#m-${conv.messages[0].id}`);await page.locator(`[data-message-id="${conv.messages[0].id}"]`).waitFor();assert.ok(await page.locator('#thread .msg').count()<=60);assert.ok(await page.locator('.load-latest').isVisible())
 })
 await test('repeat matches can move between distant windows and wrap',async()=>{
  await page.keyboard.press('Meta+f');await page.locator('#findInput').fill('repeat');await page.waitForTimeout(300)
  assert.equal(await page.locator('#findCount').innerText(),'1/3')
  await page.locator('#findNext').click();assert.equal(await page.locator('#findCount').innerText(),'2/3')
  await page.locator('#findNext').click();assert.equal(await page.locator('#findCount').innerText(),'3/3');assert.match(await page.locator('mark.find-hit.active').innerText(),/repeat/)
  await page.locator('#findNext').click();assert.equal(await page.locator('#findCount').innerText(),'1/3');assert.ok(await page.locator('#thread .msg').count()<=60)
 })
 await test('empty and zero-match searches clear prior marks',async()=>{
  await page.locator('#findInput').fill('ABSENT');await page.waitForTimeout(300);assert.equal(await page.locator('#findCount').innerText(),'0/0');assert.equal(await page.locator('mark.find-hit').count(),0)
  await page.locator('#findInput').fill('');await page.waitForTimeout(300);assert.equal(await page.locator('#findCount').innerText(),'0/0');await page.keyboard.press('Escape')
 })
 await test('cancelled find debounce cannot reapply after close',async()=>{
  await page.keyboard.press('Meta+f');await page.locator('#findInput').fill('repeat');await page.keyboard.press('Escape');await page.waitForTimeout(300);assert.equal(await page.locator('mark.find-hit').count(),0);assert.ok(!page.url().includes('#q='))
 })
 await test('prompt deletion undo restores exact content and persists',async()=>{
  await page.locator('#promptsBtn').click();await page.locator('#promptName').fill('Undo QA');await page.locator('#promptText').fill('Retain exact body');await page.locator('#promptForm button').click()
  const row=page.locator('.prompt-card').filter({hasText:'Undo QA'});await row.getByRole('button',{name:'删除提示词：Undo QA'}).click();assert.equal(await row.count(),0)
  await page.locator('#toast .toast-action').click();assert.match(await row.innerText(),/Retain exact body/);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'插入提示词：Undo QA')
  await page.keyboard.press('Escape');await page.reload();await page.locator('#shell').waitFor({state:'visible'});await page.locator('#promptsBtn').click();assert.equal(await row.count(),1)
 })
 await page.screenshot({path:path.join(out,'find-undo.png')})
} finally { await browser.close();await sandbox.stop();fs.writeFileSync(path.join(out,'find.json'),JSON.stringify({label,scope:'isolated real browser and HTTP; synthetic messages, no models',results},null,2)) }
if(results.some(x=>x.status!=='passed')) process.exitCode=1
