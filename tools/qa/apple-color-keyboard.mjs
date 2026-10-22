import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ROOT, createSandbox, launchBrowser, loginPage } from './quality-harness.mjs'
const label = process.env.QA_LABEL || 'apple-color-keyboard'
const out = path.join(ROOT, 'reports/quality', label)
fs.mkdirSync(out, { recursive: true })
const id = 'qa-color-keyboard'
const sandbox = await createSandbox({ port: Number(process.env.QA_PORT || 8810), label, seedConversations: [{ id, title: 'QA 色彩与键盘验收', messages: [{ role: 'user', text: '检查字号、密度和键盘操作。' }, { role: 'assistant', text: '这是一段用于读取实际计算字号的合成正文。\n\n第二段内容用于检查阅读节奏与对话间距。' }] }] })
const browser = await launchBrowser(), results = []
const test = async (name, run) => {
  try { const { ok, ...evidence } = await run(); results.push({ name, status: ok ? 'passed' : 'failed', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }
  catch (error) { results.push({ name, status: 'blocked', evidence: { error: error.message } }); console.log(`BLOCKED ${name}: ${error.message}`) }
}
const colors = (page, selector) => page.locator(selector).evaluateAll(nodes => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map((value,index) => index === 3 ? value/255 : value) }
  const over = (front, back) => [0,1,2].map(index => front[index]*front[3]+back[index]*(1-front[3])).concat(1)
  const luminance = rgb => rgb.slice(0,3).map(value => value/255).map(value => value<=0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4).reduce((sum,value,index) => sum+value*[0.2126,0.7152,0.0722][index],0)
  return nodes.filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[hidden]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => {
    const chain=[]; for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)chain.unshift(ancestor)
    let bg=[255,255,255,1], opacity=1
    for(const ancestor of chain){ const style=getComputedStyle(ancestor); bg=over(rgba(style.backgroundColor),bg); opacity*=Number(style.opacity) }
    const css=getComputedStyle(el), raw=rgba(css.color); raw[3]*=opacity
    const fg=over(raw,bg),a=luminance(fg),b=luminance(bg)
    return { selector: el.id || el.className, text: el.textContent.trim().slice(0,90), font:css.fontSize,color:css.color,background:bg,foreground:fg,opacity,contrast:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05) }
  })
})
try {
  for(const width of [1440,390]) for(const theme of ['light','dark']) {
    const context=await browser.newContext({viewport:{width,height:width===390?844:1000},hasTouch:width===390,serviceWorkers:'block'})
    await context.addInitScript(theme=>localStorage.setItem('dsh.theme',theme),theme)
    const page=await context.newPage();page.setDefaultTimeout(7000)
    await loginPage(page,sandbox)
    const prefix=`${width} ${theme}`
    const sidebar=async()=>{if(width<1024 && await page.locator('#menuBtn').getAttribute('aria-expanded')!=='true')await page.locator('#menuBtn').click()}
    const closeSidebar=async()=>{if(width<1024 && await page.locator('#menuBtn').getAttribute('aria-expanded')==='true')await page.keyboard.press('Escape')}
    const contrast=async(name,selector,minimum=4.5)=>test(`${prefix}: ${name} contrast >= ${minimum}`,async()=>{await page.waitForTimeout(400);const samples=await colors(page,selector);return{ok:samples.length>0&&samples.every(x=>x.contrast>=minimum),minimum,samples}})
    await contrast('home descriptions','.empty-sub,.scenario-desc,.scenario-need,.scenario-note')
    await contrast('primary home action','.hero-link:not(.muted)')
    await sidebar();await contrast('sidebar metadata','.conv-preview,.conv-meta,.conv-group-label');await closeSidebar()
    await page.locator('#input').fill('QA contrast draft, do not send')
    await contrast('enabled send icon','#sendBtn',3)
    await page.locator('#permissionBtn').click()
    await contrast('permission descriptions','.permission-option-desc')
    await page.screenshot({path:path.join(out,`permission-${width}-${theme}.png`),fullPage:true})
    await test(`${prefix}: permission Escape returns keyboard focus`,async()=>{await page.keyboard.press('Escape');const active=await page.evaluate(()=>document.activeElement.id);return{ok:active==='permissionBtn'&&!await page.locator('#permissionMenu').isVisible(),active}})
    await sidebar();await page.locator('#settingsBtn').click()
    await contrast('settings descriptions','.settings-desc,.settings-hint,.sheet-sub')
    await test(`${prefix}: keyboard radio change and Escape preserve usable focus`,async()=>{
      await page.locator('button[data-density="comfortable"]').focus();await page.keyboard.press('ArrowRight')
      const changed=await page.locator('button[data-density="compact"]').getAttribute('aria-checked')==='true'
      const oneTab=await page.locator('#densityOptions [tabindex="0"]').count()===1
      await page.keyboard.press('Escape')
      const focus=await page.evaluate(()=>({id:document.activeElement.id,visible:document.activeElement!==document.body&&document.activeElement.getClientRects().length>0,inert:document.querySelector('#shell').inert}))
      return{ok:changed&&oneTab&&focus.id==='settingsBtn'&&focus.visible&&!focus.inert,changed,oneTab,focus}
    })
    await closeSidebar()
    await page.screenshot({path:path.join(out,`home-${width}-${theme}.png`),fullPage:true})
    await context.close()
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',colorScheme:'light'})
  const page=await context.newPage();page.setDefaultTimeout(7000)
  await loginPage(page,sandbox)
  await test('automatic theme follows system light and dark without changing user selection',async()=>{
    await page.locator('#settingsBtn').click();await page.locator('[data-theme-option="auto"]').click();await page.keyboard.press('Escape')
    const values=[]
    for(const scheme of ['light','dark','light']){await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(50);values.push(await page.evaluate(()=>({scheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',theme:document.documentElement.getAttribute('data-theme'),stored:localStorage.getItem('dsh.theme'),background:getComputedStyle(document.body).backgroundColor})))}
    return{ok:values.every(x=>x.theme===null&&x.stored==='auto')&&values[0].background==='rgb(255, 255, 255)'&&values[1].background==='rgb(28, 28, 30)'&&values[2].background===values[0].background,values}
  })
  await page.locator(`.conv-item[data-id="${id}"] .conv-main`).click();await page.locator('#thread .md').waitFor()
  const reading=()=>page.evaluate(()=>({font:getComputedStyle(document.querySelector('#thread .md')).fontSize,line:getComputedStyle(document.querySelector('#thread .md')).lineHeight,messageGap:getComputedStyle(document.querySelector('#thread .msg')).marginBottom,userPadding:getComputedStyle(document.querySelector('#thread .msg.user .bubble')).paddingTop,density:document.documentElement.dataset.density,scale:document.documentElement.style.getPropertyValue('--reading-scale')}))
  await test('reading font controls change actual text size in increasing steps',async()=>{
    const sizes=[];await page.locator('#settingsBtn').click()
    for(const value of ['0.94','1','1.1']){await page.locator(`[data-font="${value}"]`).click();sizes.push(await reading())}
    await page.keyboard.press('Escape')
    return{ok:parseFloat(sizes[0].font)<parseFloat(sizes[1].font)&&parseFloat(sizes[1].font)<parseFloat(sizes[2].font)&&sizes[0].scale==='0.94'&&sizes[2].scale==='1.1',sizes}
  })
  await test('reading density changes actual message spacing and bubble padding',async()=>{
    const values=[];await page.locator('#settingsBtn').click()
    for(const value of ['comfortable','compact']){await page.locator(`button[data-density="${value}"]`).click();values.push(await reading())}
    await page.keyboard.press('Escape')
    return{ok:parseFloat(values[1].messageGap)<parseFloat(values[0].messageGap)&&parseFloat(values[1].userPadding)<parseFloat(values[0].userPadding),values}
  })
  await test('reading font and density persist through page reload',async()=>{
    const before=await reading();await page.reload();await page.locator('#thread .md').waitFor();await page.waitForTimeout(200);const after=await reading()
    return{ok:after.scale==='1.1'&&after.density==='compact'&&before.font===after.font&&before.messageGap===after.messageGap&&before.userPadding===after.userPadding,before,after}
  })
  await context.close()
}finally{
  const cssFiles=Object.fromEntries(['public/css/design-system.css','public/css/codex.css'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(sandbox.dir,file))).digest('hex')]))
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({label,generatedAt:new Date().toISOString(),sourceSnapshot:sandbox.dir,sourceFiles:sandbox.sourceFiles,cssFiles,scope:'Real Chrome CSS and keyboard tests on synthetic conversations. Alpha-composited text contrast excludes disabled controls and waits 400ms for UI transitions; this is a scoped review, not a WCAG certification or real-device study.',results},null,2))
  await browser.close();await sandbox.stop()
}
