// The City Gardener's brain: a small endpoint in the Vite dev server (npm run dev only).
// It hands the gardener's notes to Claude through `claude -p` and returns one checked action.
// In demo mode the gardener may plant up to DEMO_PLANTS trees in one turn and keep up to DEMO_MAX_TREES.
// The built site on GitHub Pages has no server, so this file never runs there.
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const MAX_TREES = 30
const DEMO_MAX_TREES = 150
const DEMO_PLANTS = 5
const TIMEOUT_MS = 60e3

// The same gardener in both modes; only the planting action and the tree limit differ.
const systemPrompt = (demo) => {
  const max = demo ? DEMO_MAX_TREES : MAX_TREES
  const plant = demo
    ? `- plant_trees: plant 1 to ${DEMO_PLANTS} trees in this turn. Give a list of plantings, each with a segment_id from sunny_segments
  and one short reason. A long segment may appear more than once. Never invent a segment.`
    : '- plant_tree: plant one tree on a segment. segment_id must be one of the ids in sunny_segments. Never invent a segment.'
  return `You are the City Gardener of central Weimar: a patient, practical urban gardener.
You want to cool the streets people actually walk the most, by planting street trees where the sun is hardest.
Each turn you get your notes as JSON: the date and clock time, the sun, the sunniest street segments near the current walk
(with their hours of sun between 11:00 and 17:00, counting the shade of trees already planted), where people started walks recently,
and the trees you planted yourself.
Choose exactly one action:
${plant}
- remove_tree: remove one of your own trees that is now useless, for example one far from where people walk whose street hardly gets sun.
  tree_id must be one of the ids in my_trees.
- wait: when nothing would clearly help, or when you have ${max} trees and none is useless.
Never plant when you already have ${max} trees. Prefer streets with many hours of sun near recent walk starts.
When segments have walk_minutes, strongly prefer those at 5 or 10 minutes from the start of the walk over those at 15.
Give the reason in one short, plain sentence.`
}

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['plant_tree', 'remove_tree', 'wait'] },
    segment_id: { type: 'string', description: 'for plant_tree: an id from sunny_segments' },
    tree_id: { type: 'string', description: 'for remove_tree: an id from my_trees' },
    reason: { type: 'string', description: 'one short sentence' },
  },
  required: ['action', 'reason'],
  additionalProperties: false,
}

const DEMO_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['plant_trees', 'remove_tree', 'wait'] },
    plantings: {
      type: 'array',
      description: `for plant_trees: 1 to ${DEMO_PLANTS} trees`,
      maxItems: DEMO_PLANTS,
      items: {
        type: 'object',
        properties: {
          segment_id: { type: 'string', description: 'an id from sunny_segments' },
          reason: { type: 'string', description: 'one short sentence' },
        },
        required: ['segment_id', 'reason'],
        additionalProperties: false,
      },
    },
    tree_id: { type: 'string', description: 'for remove_tree: an id from my_trees' },
    reason: { type: 'string', description: 'one short sentence about the whole turn' },
  },
  required: ['action', 'reason'],
  additionalProperties: false,
}

function askClaude(state, demo) {
  const args = [
    '-p',
    '--safe-mode',
    '--tools', '',
    '--model', 'haiku',
    '--effort', 'low',
    '--output-format', 'json',
    '--no-session-persistence',
    '--system-prompt', systemPrompt(demo),
    '--json-schema', JSON.stringify(demo ? DEMO_SCHEMA : SCHEMA),
  ]
  return new Promise((resolve, reject) => {
    // Run from the temp folder, so no project files end up in the gardener's context.
    const child = spawn('claude', args, { cwd: tmpdir(), windowsHide: true })
    let out = '', err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Claude took longer than a minute'))
    }, TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`could not start claude (${e.message})`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`claude stopped with code ${code}: ${(err || out).trim().slice(0, 300)}`))
      try {
        const reply = JSON.parse(out)
        if (reply.is_error) return reject(new Error(String(reply.result).slice(0, 300)))
        resolve(reply.structured_output ?? JSON.parse(reply.result))
      } catch {
        reject(new Error(`unreadable answer from claude: ${out.slice(0, 300)}`))
      }
    })
    child.stdin.end(`My notes for this turn:\n${JSON.stringify(state, null, 1)}`)
  })
}

// Turns an answer that breaks the rules into a wait, and says why.
export function check(answer, state, demo = false) {
  const reason = String(answer.reason ?? '').trim()
  const wait = (note) => ({ action: 'wait', reason, note })
  const listed = (id) => state.sunny_segments.some((s) => String(s.id) === id)
  if (demo && answer.action === 'plant_trees') {
    // Keeps the plantings on listed segments, as many as fit under the limit.
    const room = Math.max(0, Math.min(DEMO_PLANTS, DEMO_MAX_TREES - state.my_trees.length))
    const all = (answer.plantings ?? []).map((p) => ({ segment_id: String(p.segment_id ?? ''), reason: String(p.reason ?? '').trim() }))
    const unknown = all.filter((p) => !listed(p.segment_id))
    const plantings = all.filter((p) => listed(p.segment_id)).slice(0, room)
    const notes = [
      unknown.length && `not in the list: ${unknown.map((p) => `"${p.segment_id}"`).join(', ')}`,
      all.length - unknown.length > room && `only ${room} more ${room === 1 ? 'tree fits' : 'trees fit'}`,
    ].filter(Boolean)
    if (!plantings.length) return wait(notes.join('; ') || 'no plantings given')
    return { action: 'plant_trees', plantings, reason, ...(notes.length && { note: notes.join('; ') }) }
  }
  if (!demo && answer.action === 'plant_tree') {
    const id = String(answer.segment_id ?? '')
    if (!listed(id)) return wait(`segment "${id}" is not in the list`)
    if (state.my_trees.length >= MAX_TREES) return wait(`already ${MAX_TREES} trees`)
    return { action: 'plant_tree', segment_id: id, reason }
  }
  if (answer.action === 'remove_tree') {
    const id = String(answer.tree_id ?? '')
    if (!state.my_trees.some((t) => t.id === id)) return wait(`tree "${id}" is not one of mine`)
    return { action: 'remove_tree', tree_id: id, reason }
  }
  return { action: 'wait', reason }
}

const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function gardener() {
  let busy = false
  return {
    name: 'city-gardener',
    configureServer(server) {
      server.middlewares.use('/api/gardener', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        if (busy) return send(res, 429, { error: 'the gardener is still thinking' })
        let body = ''
        req.on('data', (d) => (body += d))
        req.on('end', async () => {
          busy = true
          try {
            const { state, demo = false } = JSON.parse(body)
            send(res, 200, check(await askClaude(state, demo), state, demo))
          } catch (e) {
            send(res, 500, { error: e.message })
          } finally {
            busy = false
          }
        })
      })
    },
  }
}
