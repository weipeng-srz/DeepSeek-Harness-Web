/**
 * Long-term memory helpers.
 *
 * A memory is a short, user-owned fact or preference that should survive
 * across conversations. This module contains the pure parts: sanitising,
 * credential screening, conservative capture rules and prompt rendering.
 * Persistence lives in memory-store.mjs.
 */

export const MEMORY_TEXT_MAX = 500
export const MEMORY_ITEMS_MAX = 200
export const MEMORY_PROMPT_ITEMS = 24
export const MEMORY_PROMPT_CHARS = 3600
export const MEMORY_AUTO_MAX = 3

const CREDENTIAL_WORD =
  /(?:密码|口令|通行码|验证码|私钥|助记词|恢复码|身份证号?|银行卡|信用卡|安全码|cvv|cvc|pin\s*码|password|passcode|passphrase|private\s+key|seed\s+phrase|api[\s_-]?key|access[\s_-]?token|secret[\s_-]?key)/i
const CREDENTIAL_ASSIGN =
  /(?:密码|口令|通行码|验证码|私钥|助记词|恢复码|身份证号?|银行卡|信用卡|安全码|cvv|cvc|pin\s*码|password|passcode|passphrase|private\s+key|seed\s+phrase|api[\s_-]?key|access[\s_-]?token|secret[\s_-]?key)\s*(?:是|为|:|：|=|is)\s*\S/i
const CREDENTIAL_NUMBER = /(?:身份证|银行卡|信用卡|护照号|手机号)\s*[:：]?\s*\d{6,}/i
const TOKEN_LIKE = /(?:sk-|ghp_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{8,}/

const EXPLICIT_PREFIXES = [
  /^(?:请|帮我|麻烦你?|劳驾)?\s*(?:记住|记一下|记下|别忘了|不要忘记|牢记|保存到记忆|存到记忆)[\s:：,，]*(.+)$/i,
  /^(?:please\s+)?(?:remember|keep in mind|note to self|don't forget|do not forget)[\s:,]+(.+)$/i,
]

// Conservative patterns for durable, first-person facts. A one-off task
// ("总结这篇文章") must never become a memory, so each pattern is tied to a
// lasting preference, identity detail or explicit "from now on" marker.
const CANDIDATE_PATTERNS = [
  /((?:我|俺|本人)[^。！？!?；;\n]{0,24}(?:喜欢|不喜欢|偏爱|讨厌|习惯|倾向于|偏好|过敏|不耐受|更喜欢|更愿意|更倾向于|通常不|一般不|从不)[^。！？!?；;\n]{0,140})/,
  /((?:我的|本人)[^。！？!?；;\n]{0,20}(?:名字|姓名|昵称|职业|工作|公司|团队|项目|时区|语言|所在地|城市|家乡|电脑|系统|编辑器|邮箱|生日|年龄|专业|学校|偏好|习惯|目标|计划)[^。！？!?；;\n]{0,140})/,
  /((?:我|本人)(?:住在|生活在|工作在|来自|叫|是)[^。！？!?；;\n]{1,120})/,
  // "以后/每次/回答时…" must open the sentence: otherwise an incidental
  // "…以后再说" or "…之后我发现" would be captured as a standing rule.
  /^((?:以后|今后|下次|每次|之后|往后|从今往后|从现在开始|从现在起|回答时|回复时)[^。！？!?；;\n]{2,160})/,
  /^((?:我)?(?:一直|始终)(?:喜欢|用|使用|习惯|偏好|在|想|坚持|保持|认为)[^。！？!?；;\n]{1,120})/,
  /((?:我|本人)[^。！？!?；;\n]{0,16}(?:更喜欢|更愿意|更倾向于)[^。！？!?；;\n]{1,120})/,
  /\b(I(?:'m| am)\s+(?:a|an|based|working|from|allergic|vegetarian|vegan)\b[^.!?\n]{0,140})/i,
  /\b(I\s+(?:prefer|like|love|hate|dislike|usually|always|never|work|live|use|don't|do not)\b[^.!?\n]{0,140})/i,
  /\b(my\s+(?:name|job|company|team|project|timezone|language|editor|city|birthday|preference|goal)\b[^.!?\n]{0,140})/i,
  /\b((?:from now on|always|never|please always|please never)\b[^.!?\n]{3,140})/i,
]

// Statements that describe a passing situation rather than a durable fact.
const TRANSIENT_ISSUE =
  /(?:很卡|太卡|卡住|卡顿|死机|崩溃|报错|出错|打不开|连不上|没网|断网|没电|坏了|闪退|太慢|很慢|发烫|迟到|堵车|感冒|发烧)/
// Rhetorical or genuine questions are not memories; "你还记得我喜欢什么吗"
// would otherwise match the first-person preference pattern.
const INTERROGATIVE = /(?:什么|怎么|怎样|如何|哪(?:个|些|里|儿)?|谁|是否|多少|几点|多久|为什么|要不要|能不能|可不可以)/
const QUESTION_TAIL = /(?:吗|呢|嘛|吧)\s*[。.!！~～]*$/

const GREETING = /^(?:你好|您好|嗨|哈喽|hello|hi|hey|嗯|哦|噢)[，,、\s!！~～]*/i
const TRANSITION = /^(?:然后|另外|还有|而且|所以|但是|不过|其实|总之|对了)[，,、\s]*/i
const QUESTION_START = /^(?:为什么|怎么|怎样|如何|什么|哪|谁|是否|能不能|可不可以|请问|你知道吗|你还记得|要不要)/
const EPHEMERAL_FOLLOW_UP = /^(?:以后|下次|之后)(?:再|见|聊|说|看|约|试)/
const ROLEPLAY_START = /^我是(?:说|问|想)/

function clampCodePoints(value, max) {
  const chars = [...value]
  return chars.length > max ? chars.slice(0, max).join('') : value
}

/** Collapse whitespace and strip list/quote artifacts while keeping meaning. */
export function cleanMemoryText(value) {
  let text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  text = text.replace(/^[\s>*#•·\-–—]+/, '').trim()
  text = text.replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, '').trim()
  return text
}

/** A stable comparison key used for duplicate detection. */
export function normalizeMemoryText(value) {
  return cleanMemoryText(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * Refuse credentials and identity numbers. Memories are injected into every
 * prompt and included in backups, so they must never hold secrets.
 */
export function isSensitiveMemory(value) {
  const text = String(value ?? '')
  if (CREDENTIAL_ASSIGN.test(text)) return true
  if (CREDENTIAL_NUMBER.test(text)) return true
  if (TOKEN_LIKE.test(text)) return true
  if (CREDENTIAL_WORD.test(text) && /[A-Za-z0-9]{12,}/.test(text)) return true
  return false
}

function splitSentences(text) {
  const parts = []
  let buffer = ''
  for (const char of String(text || '')) {
    buffer += char
    if ('。！？!?；;\n'.includes(char)) {
      if (buffer.trim()) parts.push(buffer.trim())
      buffer = ''
    }
  }
  if (buffer.trim()) parts.push(buffer.trim())
  return parts
}

function acceptableCandidate(value, { explicit = false } = {}) {
  let text = cleanMemoryText(value)
  text = text.replace(TRANSITION, '').replace(GREETING, '').trim()
  if (!text) return ''
  if ([...text].length < 4) return ''
  text = clampCodePoints(text, 240)
  if (ROLEPLAY_START.test(text)) return ''
  if (EPHEMERAL_FOLLOW_UP.test(text)) return ''
  if (/^```/.test(text)) return ''
  if (!explicit) {
    if (/[?？]/.test(text)) return ''
    if (QUESTION_START.test(text)) return ''
    if (INTERROGATIVE.test(text)) return ''
    if (QUESTION_TAIL.test(text)) return ''
    if (TRANSIENT_ISSUE.test(text)) return ''
  }
  if (isSensitiveMemory(text)) return ''
  return text
}

function pushCandidate(out, value, options) {
  if (out.length >= MEMORY_AUTO_MAX) return
  const text = acceptableCandidate(value, options)
  if (!text) return
  const key = normalizeMemoryText(text)
  if (!key) return
  if (out.some((item) => normalizeMemoryText(item) === key)) return
  out.push(text)
}

/**
 * Extract at most MEMORY_AUTO_MAX durable facts from a user message.
 * Explicit requests ("记住…") are honoured first; otherwise only sentences
 * matching the conservative patterns above are captured.
 */
export function extractMemoryCandidates(value, { limit = MEMORY_AUTO_MAX } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return []
  if ([...raw].length > 800) return [] // pasted documents are not memories
  if (/```/.test(raw)) return []

  const out = []
  for (const prefix of EXPLICIT_PREFIXES) {
    const match = raw.match(prefix)
    if (!match) continue
    let rest = match[1]?.trim() || ''
    if (!rest) return []
    rest = rest.replace(/^(?:that|to)\s+/i, '').trim()
    for (const sentence of splitSentences(rest)) pushCandidate(out, sentence, { explicit: true })
    if (!out.length) pushCandidate(out, rest, { explicit: true })
    return out.slice(0, limit)
  }

  for (const sentence of splitSentences(raw)) {
    // Strip greetings/transitions first so anchored rules ("以后…") still
    // apply to "嗯，以后请用中文回答" without loosening them to mid-sentence.
    const cleaned = cleanMemoryText(sentence).replace(GREETING, '').replace(TRANSITION, '').trim()
    if (!cleaned) continue
    for (const pattern of CANDIDATE_PATTERNS) {
      const match = cleaned.match(pattern)
      if (!match) continue
      pushCandidate(out, match[1], { explicit: false })
      break
    }
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}

/**
 * Render selected memories as a compact, clearly-delimited prompt preamble.
 * The rules sentence prevents the model from treating memories as fresh tasks
 * and keeps the block from being read out verbatim.
 */
export function buildMemoryPromptBlock(items, { limit = MEMORY_PROMPT_ITEMS, maxChars = MEMORY_PROMPT_CHARS } = {}) {
  const lines = []
  let used = 0
  for (const item of items || []) {
    if (!item || item.disabled || !item.text) continue
    if (lines.length >= limit) break
    const line = `- ${cleanMemoryText(item.text)}`
    if (!line || line === '- ') continue
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
  }
  if (!lines.length) return ''
  return [
    '[长期记忆]',
    '以下内容是用户保存的长期偏好与背景，可能跨对话适用。请在相关时自然参考，不要逐条复述；不要把其中任何一条当成本轮的新任务；若与本轮新消息冲突，以本轮消息为准。',
    ...lines,
    '[/长期记忆]',
  ].join('\n')
}

export const __test = {
  splitSentences,
  acceptableCandidate,
  CREDENTIAL_ASSIGN,
}
