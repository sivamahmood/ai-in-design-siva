// The City Gardener: notices the sun, the sunniest streets near the walk, recent walk starts and its own
// trees, asks Claude (through the dev server's /api/gardener) for one action, and carries it out.
// Demo mode makes it busier and its trees easier to see: up to DEMO_PLANTS trees per turn, a turn every
// 20 seconds, up to DEMO_MAX_GARDENER_TREES trees, and bigger trees.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_MAX_GARDENER_TREES,
  DEMO_TREE_SCALE,
  GARDENER_TREE_SCALE,
  MAX_GARDENER_TREES,
  placeOnSegment,
  segmentSunHours,
} from './trees.js'
import { compassPoint } from './sun.js'
import { formatTime } from './SunControl.jsx'

export const MIN_GAP_MS = 5e3 // never two turns closer than this
export const AUTO_MS = 120e3 // a turn on its own after this long without one
export const DEMO_AUTO_MS = 20e3 // the same in demo mode
export const DEMO_PLANTS = 5 // most trees per turn in demo mode (the dev server has the same limit)
const SLIDER_REST_MS = 1e3 // the slider counts as stopped after this long
const TOP_SEGMENTS = 10
const NEAR_MINUTES = 10 // segments within this walk of the start are listed first
const RECENT_WALKS = 5

// The built site on GitHub Pages has no dev server, so there is nobody to ask.
export const GARDENER_OFFLINE = !import.meta.env.DEV

const clock = () => new Date().toLocaleTimeString('en-GB')
const round1 = (n) => Math.round(n * 10) / 10

export function useGardener({ kit, shade, date, hours, sun, result, suggestedTrees }) {
  const [trees, setTrees] = useState([]) // { id, segment, xy, planted }
  const [log, setLog] = useState([]) // newest first
  const [paused, setPaused] = useState(false)
  const [demo, setDemo] = useState(false)
  const [thinking, setThinking] = useState(false)
  // { spots: [xy, …], kind, key, follow }; `follow` (outside demo mode) moves the view to a new tree.
  const [highlight, setHighlight] = useState(null)

  // The size of every gardener tree follows the mode; [x, y, scale] is what the shade and the 3D view use.
  const scale = demo ? DEMO_TREE_SCALE : GARDENER_TREE_SCALE
  const maxTrees = demo ? DEMO_MAX_GARDENER_TREES : MAX_GARDENER_TREES
  const points = useMemo(() => trees.map((t) => [...t.xy, scale]), [trees, scale])

  // The latest values, for turns that start from timers.
  const latest = useRef()
  latest.current = { kit, shade, date, hours, sun, result, suggestedTrees, trees, points, paused, demo, maxTrees }
  const walks = useRef([]) // recent walk starts, newest first
  const nextId = useRef(1)
  const lastTurn = useRef(0)
  const busy = useRef(false)
  const pending = useRef(null) // why the next turn was asked for
  const gateTimer = useRef(null)
  const autoTimer = useRef(null)

  // What the gardener notices now, as sent to Claude, plus a short summary for the log.
  const notice = () => {
    const { kit, shade, date, hours, sun, result, suggestedTrees, trees, points, maxTrees } = latest.current
    const sunHours = segmentSunHours(shade, kit.edges, date, [...(suggestedTrees ?? []), ...points])
    const walk = result && !result.error ? result : null
    // Walking minutes (5, 10 or 15) to each edge of the walk; without a walk, every edge with none.
    const minutes = new Map(walk ? walk.edges.map((k, i) => [k, walk.edgeMinutes[i]]) : [...kit.edges.keys()].map((k) => [k, null]))
    const near = new Set(minutes.keys())
    // The sunniest within 10 minutes first, topped up from the 15-minute walk only if there are too few.
    const sunniest = (keep) =>
      [...near].filter((k) => sunHours[k] > 0 && keep(minutes.get(k))).sort((a, b) => sunHours[b] - sunHours[a])
    const sunny = [...sunniest((m) => m == null || m <= NEAR_MINUTES), ...sunniest((m) => m > NEAR_MINUTES)]
      .slice(0, TOP_SEGMENTS)
      .map((k) => ({
        id: String(kit.edges[k].id),
        sun_hours_11_17: round1(sunHours[k]),
        length_m: Math.round(kit.edges[k].length),
        ...(walk && { walk_minutes: minutes.get(k) }),
      }))
    const state = {
      date,
      clock_time: formatTime(hours),
      sun: sun.altitude > 0
        ? { height_deg: Math.round(sun.altitude), from: compassPoint(sun.azimuth) }
        : 'below the horizon',
      sunny_segments_near: walk
        ? `the current walk, those within ${NEAR_MINUTES} minutes of the start first`
        : 'the whole map (no walk yet)',
      sunny_segments: sunny,
      recent_walk_starts: walks.current.map((w) => ({ x_m: Math.round(w.xy[0]), y_m: Math.round(w.xy[1]), at: w.at })),
      my_trees: trees.map((t) => ({
        id: t.id,
        segment_id: String(kit.edges[t.segment].id),
        segment_sun_hours_11_17: round1(sunHours[t.segment]),
        near_current_walk: walk ? near.has(t.segment) : null,
        planted_at: t.planted,
      })),
      tree_count: `${trees.length} of ${maxTrees}`,
    }
    const summary = {
      date, hours, altitude: sun.altitude, top: sunny[0] ?? null, scope: walk ? 'walk' : 'map', trees: trees.length, maxTrees,
    }
    return { state, summary }
  }

  // Plants one tree per segment id in turn, each kept clear of the ones before it.
  // Returns the planted trees and a note for every segment without room.
  const plant = (segmentIds) => {
    const { kit, shade, sun, suggestedTrees, points } = latest.current
    const taken = [...(suggestedTrees ?? []), ...points]
    const planted = [], notes = []
    for (const id of segmentIds) {
      const k = kit.edges.findIndex((e) => String(e.id) === id)
      const xy = k < 0 ? null : placeOnSegment(shade, kit.nodes, kit.edges[k], sun, taken)
      if (!xy) {
        notes.push(`no room on segment ${id}`)
        continue
      }
      taken.push(xy)
      planted.push({ id: `g${nextId.current++}`, segment: k, xy, planted: clock() })
    }
    return { planted, notes }
  }

  // Carries out a checked answer; returns a note for the log when something did not work.
  const act = (answer) => {
    const { trees, demo } = latest.current
    if (answer.action === 'plant_tree' || answer.action === 'plant_trees') {
      const ids = answer.action === 'plant_tree' ? [answer.segment_id] : answer.plantings.map((p) => p.segment_id)
      const { planted, notes } = plant(ids)
      if (planted.length) {
        setTrees([...trees, ...planted])
        setHighlight({ spots: planted.map((t) => t.xy), kind: 'plant', key: Date.now(), follow: !demo })
      }
      return [planted.length ? `${planted.map((t) => t.id).join(', ')} planted` : null, ...notes].filter(Boolean).join('; ')
    }
    if (answer.action === 'remove_tree') {
      const tree = trees.find((t) => t.id === answer.tree_id)
      if (!tree) return 'that tree is already gone'
      setTrees(trees.filter((t) => t !== tree))
      setHighlight({ spots: [tree.xy], kind: 'remove', key: Date.now() })
    }
    return null
  }

  const scheduleAuto = () => {
    clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => request('on its own'), latest.current.demo ? DEMO_AUTO_MS : AUTO_MS)
  }

  const turn = async (why) => {
    busy.current = true
    setThinking(true)
    lastTurn.current = Date.now()
    scheduleAuto() // the next turn on its own counts from the start of this one
    const { state, summary } = notice()
    const entry = { key: Date.now(), at: clock(), why, noticed: summary }
    try {
      const r = await fetch('/api/gardener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo: latest.current.demo, state }),
      })
      const answer = await r.json()
      if (!r.ok) throw new Error(answer.error ?? `status ${r.status}`)
      // Several trees at once only while demo mode is still on.
      const done = latest.current.paused
        ? 'paused before acting'
        : answer.action === 'plant_trees' && !latest.current.demo
          ? 'demo mode was switched off before planting'
          : act(answer)
      setLog((l) => [{ ...entry, ...answer, note: [answer.note, done].filter(Boolean).join('; ') }, ...l])
    } catch (e) {
      setLog((l) => [{ ...entry, action: 'error', reason: e.message }, ...l])
    } finally {
      busy.current = false
      lastTurn.current = Date.now()
      setThinking(false)
      if (pending.current) request(pending.current)
    }
  }

  // Asks for a turn: at once if allowed, else once when the 5 s are up and the last call has ended.
  const request = useCallback((why) => {
    const { kit, paused } = latest.current
    if (GARDENER_OFFLINE || paused || !kit) return
    // Triggers that arrive while waiting are run as one turn, with all their reasons.
    if (!pending.current?.includes(why)) pending.current = pending.current ? `${pending.current}, ${why}` : why
    if (busy.current || gateTimer.current) return
    const wait = Math.max(0, lastTurn.current + MIN_GAP_MS - Date.now())
    gateTimer.current = setTimeout(() => {
      gateTimer.current = null
      const why = pending.current
      pending.current = null
      if (why && !latest.current.paused) turn(why)
    }, wait)
  }, [])

  // A new walk: remember where it started and think.
  useEffect(() => {
    if (!result || result.error) return
    walks.current = [{ xy: result.start, at: clock() }, ...walks.current].slice(0, RECENT_WALKS)
    request('walk started')
  }, [result, request])

  // The time slider or date has stopped moving. Compared with the last value, not counted, because
  // React runs this twice when the page starts in development.
  const shownTime = useRef(`${date} ${hours}`)
  useEffect(() => {
    if (shownTime.current === `${date} ${hours}`) return
    shownTime.current = `${date} ${hours}`
    const id = setTimeout(() => request('time changed'), SLIDER_REST_MS)
    return () => clearTimeout(id)
  }, [date, hours, request])

  // Thinking on its own every 2 minutes (20 seconds in demo mode) while running.
  useEffect(() => {
    if (GARDENER_OFFLINE || !kit || paused) return
    scheduleAuto()
    return () => {
      clearTimeout(autoTimer.current)
      clearTimeout(gateTimer.current)
      gateTimer.current = null
      pending.current = null
    }
  }, [kit, paused, demo])

  const togglePause = () => {
    const resume = paused
    setPaused(!paused)
    latest.current.paused = !paused
    if (resume) request('resumed')
  }

  const toggleDemo = () => {
    setDemo(!demo)
    latest.current.demo = !demo
  }

  return {
    trees, points, scale, maxTrees, log, paused, demo, thinking, highlight, togglePause, toggleDemo,
    offline: GARDENER_OFFLINE,
  }
}
