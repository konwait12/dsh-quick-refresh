// Host half of dsh-quick-refresh.
//
// Provides an active "refresh / hot-apply" endpoint:
//   1. Re-reads <profile>/cordis.patch.yml and applies `disabled` / enabled
//      state to the running Loader entries (no dsh web restart needed).
//   2. Tries to hot-mount newly added simple plugins (plain id/name insert
//      rows) that are present in profile package.json but not yet in the
//      running composition.
//   3. The browser half then reloads the page so client bundles pick up the
//      new state.
//
// This mirrors the hot-mount mechanism used by dsh-webui-market-plugin, but
// exposes it as a manual, proactive action instead of only during installs.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'

export const name = 'dsh-quick-refresh'

/** Hard dependency: the HTTP carrier must exist before the route registers. */
export const inject = ['webServer']

const DEFAULT_PROFILE = 'web'

function dshHome() {
  return process.env.DSH_HOME || (homedir() + '/.dsh')
}

function profileDir(profile = DEFAULT_PROFILE) {
  return join(dshHome(), 'profiles', profile)
}

function readProfileDeps(profile = DEFAULT_PROFILE) {
  try {
    const json = JSON.parse(readFileSync(join(profileDir(profile), 'package.json'), 'utf8'))
    return (json && json.dependencies) || {}
  } catch {
    return {}
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(obj))
}

/** Same-origin check: the browser's Origin host must equal the request Host. */
function sameOrigin(req) {
  const origin = req.headers && req.headers.origin
  const host = req.headers && req.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Parse a profile cordis.patch.yml into id -> desired-disabled map.
 * Handles both:
 *   - insert blocks containing rows with optional `disabled: true`
 *   - top-level id-targeted overrides like
 *       - id: ui-dsh-aionui-panel
 *         disabled: true
 */
function parseDesiredDisabled(text) {
  const desired = new Map()
  let currentId = null
  let currentDisabled = false

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '')
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)
    if (idMatch) {
      if (currentId !== null) desired.set(currentId, currentDisabled)
      currentId = idMatch[1]
      currentDisabled = false
      continue
    }
    const disMatch = /^\s*disabled:\s*(true|false)\s*$/.exec(line)
    if (disMatch && currentId !== null) {
      currentDisabled = disMatch[1] === 'true'
    }
  }
  if (currentId !== null) desired.set(currentId, currentDisabled)
  return desired
}

/**
 * Parse a bundle patch that contains plain `- id:` / `name:` insert rows,
 * optionally with a literal `config:` block (scalar / simple nested YAML).
 *
 * Returns an array of `{ id, name, configLines? }` where `configLines` are the
 * config child lines re-indented for a hot-mount file (2-space base under
 * `config:`). Returns `null` for anything beyond that scope — `!!js`
 * expressions, `disabled:` overrides, arrays, multi-field entries — so the
 * caller keeps the old "skip, needs restart" behaviour for complex patches.
 */
function parseSimplePatch(patchText) {
  const rows = []
  let current = null
  let configIndent = -1
  const lines = String(patchText || '').split(/\r?\n/)

  const finish = () => {
    if (current) {
      if (current.name === undefined) return false
      rows.push(current)
      current = null
    }
    return true
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*$/, '')
    if (raw.trim() === '') continue
    const line = raw.trimEnd()
    if (/^-\s+insert:\s*$/.test(line)) continue

    // a new row while inside a config block ends the block; the line itself is
    // a new entry so drop through to the id/name handling below
    if (configIndent >= 0) {
      const indent = line.length - line.trimStart().length
      if (indent > configIndent) {
        if (/!!js|\{\{/.test(line)) return null
        // re-indent for the hot-mount file: `config:` sits at 2 spaces there
        current.configLines.push('  ' + line.slice(configIndent))
        continue
      }
      configIndent = -1
    }

    const idMatch = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line)
    if (idMatch) {
      if (!finish()) return null
      current = { id: idMatch[1], configLines: [] }
      continue
    }
    if (!current) return null

    const nameMatch = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (nameMatch) {
      if (current.name !== undefined) return null
      current.name = nameMatch[1]
      continue
    }
    const cfgMatch = /^(\s+)config:\s*$/.exec(line)
    if (cfgMatch) {
      if (current.configLines.length > 0) return null
      configIndent = cfgMatch[1].length
      continue
    }
    return null
  }
  if (configIndent >= 0) configIndent = -1
  if (!finish()) return null
  if (rows.length === 0) return null
  return rows
}

// ── hot mount (restart-free activation of simple new plugins) ──────────────
// The same approach as dsh-webui-market-plugin: a runtime-only Include subtree
// over a small generated yml file. Durable state stays in package.json; the
// subtree exists only for this process.

let hotTreeClass = undefined

async function loadHotTreeClass() {
  if (hotTreeClass !== undefined) return hotTreeClass
  try {
    const mod = await import('@deepseek-ai/cordis-plugin-include')
    const Include = mod.Include
    if (Include === undefined) throw new Error('no Include export')
    class QuickRefreshHotTree extends Include {
      /** Runtime-only mount list; persistence is owned by package.json/patch. */
      write() {}
    }
    hotTreeClass = QuickRefreshHotTree
  } catch {
    hotTreeClass = null
  }
  return hotTreeClass
}

function cleanHotDir(profile = DEFAULT_PROFILE) {
  try { rmSync(join(profileDir(profile), '.dsh-quick-refresh'), { force: true, recursive: true, maxRetries: 3 }) } catch {}
}

let hotSequence = 0

async function hotMountPackage(ctx, profile, packageName) {
  try {
    const HotTree = await loadHotTreeClass()
    if (HotTree === null) return false
    const patchPath = join(profileDir(profile), 'node_modules', packageName, 'cordis.patch.yml')
    if (!existsSync(patchPath)) return false
    const rows = parseSimplePatch(readFileSync(patchPath, 'utf8'))
    if (rows === null) return false
    const dir = join(profileDir(profile), '.dsh-quick-refresh')
    mkdirSync(dir, { recursive: true })
    hotSequence += 1
    const safeName = String(packageName).replace(/[^a-zA-Z0-9_.-]/g, '_')
    const file = join(dir, `hot-${hotSequence}-${safeName}.yml`)
    const yml = rows.map((row) => {
      let s = `- id: qr-${row.id}\n  name: '${row.name}'`
      if (row.configLines && row.configLines.length) {
        s += '\n  config:\n' + row.configLines.join('\n')
      }
      return s
    }).join('\n') + '\n'
    writeFileSync(file, yml)
    // Include resolves config.path as a URL against ctx.baseUrl — pass the
    // file:// href, not a bare Windows path.
    const handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href })
    await handle.await()
    return true
  } catch (e) {
    console.warn('[dsh-quick-refresh] hot mount of ' + packageName + ' failed: ' + String((e && e.message) || e))
    return false
  }
}

/**
 * Discover dsh plugins present in the profile node_modules that carry a
 * `cordis.patch.yml` but are NOT in the profile's package.json dependencies
 * (manually installed / junction-linked packages). Scoped groups are walked.
 */
function discoverPatchPackages(profile) {
  const nm = join(profileDir(profile), 'node_modules')
  const found = []
  const scan = (dir) => {
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const d of entries) {
      if (d === '.bin' || d === '.pnpm' || d.startsWith('.')) continue
      const p = join(dir, d)
      let st
      try { st = statSync(p) } catch { continue }
      if (!st.isDirectory()) continue
      if (existsSync(join(p, 'package.json'))) {
        if (existsSync(join(p, 'cordis.patch.yml'))) found.push(d)
      } else if (d.startsWith('@')) {
        scan(p)
      }
    }
  }
  scan(nm)
  return found
}

async function hotMountMissingPackages(ctx, profile) {
  const loader = ctx.get('loader')
  const loadedNames = new Set()
  if (loader) {
    for (const entry of loader.entries()) {
      const n = entry.options && entry.options.name
      if (n) loadedNames.add(n)
    }
  }
  // candidates: declared dependencies + any patch-carrying package in node_modules
  const candidates = new Set(Object.keys(readProfileDeps(profile)))
  for (const d of discoverPatchPackages(profile)) candidates.add(d)
  const mounted = []
  const skipped = []
  for (const name of candidates) {
    if (loadedNames.has(name)) continue
    const ok = await hotMountPackage(ctx, profile, name)
    if (ok) mounted.push(name)
    else skipped.push(name)
  }
  return { mounted, skipped }
}

/** Apply `disabled` states from the profile patch to the running Loader. */
async function applyDesiredDisabled(ctx, profile) {
  const loader = ctx.get('loader')
  if (!loader) return { applied: [], error: 'loader unavailable' }
  let text = ''
  try {
    text = readFileSync(join(profileDir(profile), 'cordis.patch.yml'), 'utf8')
  } catch (e) {
    return { applied: [], error: 'cannot read cordis.patch.yml: ' + String((e && e.message) || e) }
  }
  const desired = parseDesiredDisabled(text)
  const applied = []
  for (const entry of loader.entries()) {
    const id = entry.options && (entry.options.id || entry.id)
    if (!id || !desired.has(id)) continue
    const wantDisabled = desired.get(id)
    if (entry.disabled !== wantDisabled) {
      try {
        await entry.update({ disabled: wantDisabled })
        applied.push(id + (wantDisabled ? ':disabled' : ':enabled'))
      } catch (e) {
        console.warn('[dsh-quick-refresh] update ' + id + ' failed: ' + String((e && e.message) || e))
      }
    }
  }
  return { applied, error: null }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[dsh-quick-refresh] webServer service unavailable at apply; route not registered')
    return
  }

  cleanHotDir(DEFAULT_PROFILE)

  webServer.register({
    kind: 'exact',
    path: '/api/dsh-quick-refresh',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const method = String(body.method || '')
        if (method === 'refresh') {
          // Write-ish operation: only same-origin browser requests may run it.
          if (!sameOrigin(req)) {
            return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
          }
          const profile = /^[A-Za-z0-9_-]+$/.test(String(body.profile || '')) ? body.profile : DEFAULT_PROFILE

          const disabled = await applyDesiredDisabled(ctx, profile)
          const hot = await hotMountMissingPackages(ctx, profile)

          return sendJson(res, 200, {
            ok: true,
            profile,
            disabled: disabled.applied || [],
            hotMounted: hot.mounted || [],
            hotSkipped: hot.skipped || [],
            error: disabled.error || null,
          })
        }
        if (method === 'status') {
          const loader = ctx.get('loader')
          const deps = readProfileDeps(DEFAULT_PROFILE)
          const count = loader ? Array.from(loader.entries()).length : 0
          return sendJson(res, 200, { ok: true, profile: DEFAULT_PROFILE, loaderEntries: count, dependencies: Object.keys(deps).length })
        }
        return sendJson(res, 404, { ok: false, error: 'unknown method ' + method })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  })
}
