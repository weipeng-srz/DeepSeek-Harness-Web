/**
 * Fallback model catalog for the DSH engine.
 *
 * When the Desktop bridge is up, the live catalog from `chat/listModels`
 * (the exact projection the Desktop model selector renders) always wins.
 * When the Desktop app is closed and chats fall back to the headless CLI,
 * this module best-effort parses the Desktop `cordis.patch.yml` instead:
 * the `llm-pi-ai` provider block (ids/names) plus the `agent-default-model`
 * selection. Headless runs route through the same patch, so the ids stay
 * truthful even without the host; reasoning metadata is only available live,
 * so the fallback catalog simply carries no effort options — the UI then
 * hides the effort row, matching the Desktop's own behavior for adapters
 * without reasoning metadata.
 */
import fs from 'node:fs'
import { DESKTOP_PATCH, PROVIDER, MODEL } from './config.mjs'

function stripQuotes(value) {
  const text = String(value ?? '').trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1)
  }
  return text
}

function indentOf(line) {
  return line.length - line.trimStart().length
}

function isSkippable(line) {
  const text = line.trim()
  return !text || text.startsWith('#')
}

function fieldValue(line) {
  const index = line.indexOf(':')
  if (index < 0) return null
  return stripQuotes(line.slice(index + 1))
}

/**
 * Parse one `- id: <name>` top-level item into its raw line range.
 * Returns null when the item is absent.
 */
function itemRange(lines, id) {
  const marker = `- id: ${id}`
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === marker) {
      start = i
      break
    }
  }
  if (start < 0) return null
  const baseIndent = indentOf(lines[start])
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isSkippable(lines[i])) continue
    if (indentOf(lines[i]) <= baseIndent) {
      end = i
      break
    }
  }
  return { start, end, baseIndent }
}

function parseDefaultSelection(lines) {
  const range = itemRange(lines, 'agent-default-model')
  if (!range) return null
  const selection = {}
  for (let i = range.start + 1; i < range.end; i += 1) {
    const key = lines[i].trim().split(':')[0]
    if (key === 'provider') selection.provider = fieldValue(lines[i])
    else if (key === 'model') selection.model = fieldValue(lines[i])
    else if (key === 'reasoningEffort') selection.reasoningEffort = fieldValue(lines[i])
  }
  return selection.provider && selection.model ? selection : null
}

function parseProviderGroups(lines) {
  const groups = []
  const range = itemRange(lines, 'llm-pi-ai')
  if (!range) return groups
  // Locate the `providers:` mapping inside the item.
  let providersLine = -1
  for (let i = range.start + 1; i < range.end; i += 1) {
    if (isSkippable(lines[i])) continue
    if (lines[i].trim() === 'providers:') {
      providersLine = i
      break
    }
  }
  if (providersLine < 0) return groups
  const providersIndent = indentOf(lines[providersLine])

  // Split the provider mapping into per-provider line ranges.
  const providerStarts = []
  for (let i = providersLine + 1; i < range.end; i += 1) {
    if (isSkippable(lines[i])) continue
    const indent = indentOf(lines[i])
    if (indent <= providersIndent) break
    if (indent === providersIndent + 2 && lines[i].trim().endsWith(':') && !lines[i].trim().startsWith('-')) {
      providerStarts.push(i)
    }
  }
  providerStarts.forEach((start, index) => {
    const end = index + 1 < providerStarts.length ? providerStarts[index + 1] : range.end
    const id = stripQuotes(lines[start].trim().slice(0, -1))
    if (!id) return
    let name = id
    let modelsLine = -1
    for (let i = start + 1; i < end; i += 1) {
      if (isSkippable(lines[i])) continue
      if (indentOf(lines[i]) <= providersIndent + 2) continue
      const key = lines[i].trim().split(':')[0]
      if (key === 'displayName' && modelsLine < 0) {
        name = fieldValue(lines[i]) || id
      } else if (key === 'models' && lines[i].trim() === 'models:') {
        modelsLine = i
        break
      }
    }
    const models = []
    if (modelsLine >= 0) {
      const modelsIndent = indentOf(lines[modelsLine])
      let current = null
      for (let i = modelsLine + 1; i < end; i += 1) {
        if (isSkippable(lines[i])) continue
        const indent = indentOf(lines[i])
        if (indent <= modelsIndent) break
        const text = lines[i].trim()
        if (text.startsWith('- ')) {
          // Only dashes at the entry indent start a model; deeper dashes are
          // nested lists (e.g. `input:` modalities) and must not create rows.
          if (indent !== modelsIndent + 2) continue
          if (current?.id) models.push(current)
          current = { id: stripQuotes(text.slice(2).replace(/^id:\s*/, '')), name: '' }
          if (!text.includes('id:')) current = { id: stripQuotes(text.slice(2)), name: '' }
          continue
        }
        if (!current) continue
        // Only direct fields of the model entry (not nested list items).
        if (indent <= modelsIndent + 4) {
          const key = text.split(':')[0]
          if (key === 'name') current.name = fieldValue(lines[i])
          else if (key === 'description' && !current.description) current.description = fieldValue(lines[i])
        }
      }
      if (current?.id) models.push(current)
    }
    groups.push({
      id,
      name,
      models: models.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        ...(model.description ? { description: model.description } : {}),
      })),
    })
  })
  return groups.filter((group) => group.models.length > 0)
}

let memo = { key: '', catalog: null }

/**
 * The fallback catalog, memoized by patch file identity. Shape mirrors the
 * bridge's chat/listModels result so the UI can consume either interchangeably.
 */
export function staticDshCatalog() {
  let key = 'missing'
  let text = ''
  try {
    const stat = fs.statSync(DESKTOP_PATCH)
    key = `${stat.size}:${Math.floor(stat.mtimeMs)}`
    if (memo.key === key && memo.catalog) return memo.catalog
    text = fs.readFileSync(DESKTOP_PATCH, 'utf8')
  } catch {
    if (memo.key === key && memo.catalog) return memo.catalog
  }
  let groups = []
  let parsedDefault = null
  try {
    const lines = text.split('\n')
    groups = parseProviderGroups(lines)
    parsedDefault = parseDefaultSelection(lines)
  } catch {}
  const fallbackDefault = { provider: PROVIDER, model: MODEL }
  const catalog = {
    default: parsedDefault || fallbackDefault,
    routableProviders: groups.map((group) => group.id),
    groups,
    failures: [],
    source: 'fallback',
  }
  memo = { key, catalog }
  return catalog
}

/** Human label for a provider id, matching the Desktop's display rules. */
export function providerDisplayName(id, groups = []) {
  const group = groups.find((entry) => entry.id === id)
  if (group?.name && group.name !== group.id) return group.name
  if (id === 'deepseek-account') return 'DeepSeek 账号'
  return id
}
