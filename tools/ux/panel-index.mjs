// Build compact indexes for the PM consolidation pass.
import fs from 'node:fs'
import path from 'node:path'

const round = Number(process.argv[2] || 1)
const dir = path.resolve('reports/evolution', `round-${round}`, 'panel')
const findings = JSON.parse(fs.readFileSync(path.join(dir, 'all-findings.json'), 'utf8'))

const THEMES = [
  ['首屏与折叠', /首屏|折叠|cut|露出|输入区切|滚动条|一屏/],
  ['输入区与发送', /输入框|输入区|composer|发送|权限胶囊|附件|加号|麦克风|占位/],
  ['侧栏与导航', /侧栏|抽屉|导航|项目 chip|项目条|入口|菜单|收起|边条/],
  ['顶栏与标题', /顶栏|标题|topbar|模型名|面包屑/],
  ['字号与层级', /字号|字号|字体|行高|层级|太小|过大|字重|可读/],
  ['颜色与主题', /对比度|颜色|深色|浅色|主题|色值|渐变|强调色|透明度/],
  ['间距与对齐', /间距|对齐|留白|边距|padding|margin|栅格|节奏|圆角|阴影/],
  ['浮层与设置', /浮层|弹层|抽屉|设置|sheet|modal|面板|滚动|关闭|底部按钮|覆盖/],
  ['触控与移动端', /触控|44|点击区|拇指|单手|安全区|手机|320|390|横屏|键盘弹起/],
  ['焦点与无障碍', /焦点|Tab|键盘|读屏|VoiceOver|aria|语义|标签|对比度|缩放|动效/],
  ['消息与阅读', /消息|正文|阅读|宽度|行宽|长文|段落|标题层级|Markdown|引用/],
  ['工具卡与代码', /工具卡|代码块|diff|JSON|表格|命令|结果|参数|滚动/],
  ['分享与交付', /分享|导出|打印|只读|交付|快照|脱敏/],
  ['动效与状态', /动效|动画|过渡|hover|focus|active|disabled|loading|加载|空状态|错误|重试/],
  ['文案与语气', /文案|语气|措辞|重复|术语|中英|英文|标点|提示语|行话/],
  ['信息架构', /信息架构|重复|入口|分组|排序|优先|发现|找不到|命名/],
  ['性能与滚动', /性能|卡顿|掉帧|首屏|资源|DOM|滚动|长列表|延迟/],
  ['品牌与情感', /品牌|气质|记忆点|高级感|温度|情感|惊喜|审美/],
]

const SURFACE_THEME = { home: '首屏与折叠', composer: '输入区与发送', sidebar: '侧栏与导航', topbar: '顶栏与标题', thread: '消息与阅读', markdown: '消息与阅读', tool: '工具卡与代码', sheet: '浮层与设置', settings: '浮层与设置', share: '分享与交付', mobile: '触控与移动端', a11y: '焦点与无障碍', system: '间距与对齐', palette: '侧栏与导航' }
const classify = (f) => {
  const text = String(f.title || '')
  for (const [name, re] of THEMES) if (re.test(text)) return name
  return SURFACE_THEME[f.surface] || '其他'
}
for (const f of findings) f.theme = classify(f)

const groups = {}
for (const f of findings) (groups[f.theme] ||= []).push(f)
for (const list of Object.values(groups)) list.sort((a, b) => (a.severity || 'P3').localeCompare(b.severity || 'P3') || a.personaId.localeCompare(b.personaId))

const sevRank = { P0: 0, P1: 1, P2: 2, P3: 3 }
const lines = ['# Round ' + round + ' · 900 条意见标题索引', '', '按 surface 分组，P0/P1 在前。PM 用这个索引选题，再用 id 回查原文。', '']
const bySurface = {}
for (const f of findings) (bySurface[f.surface] ||= []).push(f)
for (const [surface, list] of Object.entries(bySurface).sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`## ${surface} (${list.length})`, '')
  list.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || a.personaId.localeCompare(b.personaId))
  for (const f of list) lines.push(`- **${f.severity}** \`${f.id}\` ${f.title} — ${f.personaName || f.personaId} · ${f.dimension} · ${f.theme}`)
  lines.push('')
}
fs.writeFileSync(path.join(dir, 'titles.md'), lines.join('\n'))

const themeLines = ['# Round ' + round + ' · 主题分布', '', '| 主题 | 条数 | P0 | P1 | P2 | P3 | 人数 | 代表标题 |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
for (const [theme, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  const sev = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const f of list) sev[f.severity] = (sev[f.severity] || 0) + 1
  const people = new Set(list.map((f) => f.personaId)).size
  themeLines.push(`| ${theme} | ${list.length} | ${sev.P0} | ${sev.P1} | ${sev.P2} | ${sev.P3} | ${people} | ${list[0].title} |`)
}
fs.writeFileSync(path.join(dir, 'themes.md'), themeLines.join('\n'))

const lite = findings.map((f) => ({
  id: f.id, personaId: f.personaId, personaName: f.personaName, severity: f.severity,
  surface: f.surface, dimension: f.dimension, theme: f.theme, title: f.title,
  observed: String(f.observed || '').slice(0, 240), suggestion: String(f.suggestion || '').slice(0, 240),
  evidence: f.evidence, effort: f.effort,
}))
fs.writeFileSync(path.join(dir, 'all-findings-lite.json'), JSON.stringify(lite, null, 2))
fs.writeFileSync(path.join(dir, 'theme-index.json'), JSON.stringify({ round, counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), findings: lite }, null, 2))
console.log(`titles=${findings.length} themes=${Object.keys(groups).length}`)
console.log(Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k}: ${v.length}`).join('\n'))
