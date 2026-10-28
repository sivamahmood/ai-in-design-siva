// The side panel: results for 5, 10 and 15 minutes, suggested trees, the City Gardener, the method in plain words, and the legend.
import { useState } from 'react'
import { BAND_M, MAX_SNAP_M, MINUTES, SPEED_M_PER_MIN } from './reach.js'
import { DEMO_GARDENER_CROWN, GARDENER_CROWN, REACH_COLORS, STREET_SHADE, STREET_SUN, TREE_CROWN, USE_COLORS } from './palette.js'
import { formatTime } from './SunControl.jsx'
import { DEMO_AUTO_MS, DEMO_PLANTS } from './gardener.js'
import {
  CROWN_CENTRE_M,
  CROWN_RADIUS_M,
  DEFAULT_TREES,
  DEMO_MAX_GARDENER_TREES,
  DEMO_TREE_SCALE,
  HEAT_FROM,
  GARDENER_TREE_SCALE,
  HEAT_TO,
  MAX_GARDENER_TREES,
  MAX_TREES,
  TREE_OFFSET_M,
  TREE_SPACING_M,
} from './trees.js'

const fmt = (n) => n.toLocaleString('en-GB')
const fmtDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function Results({ result, busy, areaShade, when, hasTrees }) {
  if (busy) return <p className="hint">Walking…</p>
  if (!result) return <p className="hint">Click anywhere on the ground to start a walk.</p>
  if (result.error === 'noStreet')
    return (
      <p className="warning">
        No walkable street within {MAX_SNAP_M} m of this point (the nearest is {fmt(Math.round(result.distance))} m
        away). Click closer to a street.
      </p>
    )
  return (
    <>
      <table className="results">
        <thead>
          <tr>
            <th />
            <th>Buildings</th>
            <th>Residents</th>
            <th>In shade</th>
          </tr>
        </thead>
        <tbody>
          {result.areas.map((a, i) => (
            <tr key={a.minutes}>
              <td>
                <span className="swatch" style={{ background: REACH_COLORS[i] }} />
                {a.minutes} min
              </td>
              <td>{fmt(a.buildings)}</td>
              <td>
                ≈ {fmt(a.residents)}
                {a.cellsWithoutFigure > 0 && (
                  <span className="note">
                    {' '}
                    + {a.cellsWithoutFigure} {a.cellsWithoutFigure === 1 ? 'cell' : 'cells'} without a figure
                  </span>
                )}
              </td>
              <td>{areaShade ? pct(areaShade[i].with) : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">
        In shade: share of the walked street length in building shade{hasTrees && ' or tree shade'} on{' '}
        {when}.
      </p>
    </>
  )
}

const pct = (share) => `${Math.round(share * 100)} %`

function Trees({ ready, result, areaShade, trees, treesBusy, treeShadedLength, when, onSuggest, onRemove }) {
  // Kept as typed, so the field can be cleared while typing; clamped when the button is pressed.
  const [count, setCount] = useState(String(DEFAULT_TREES))
  const clamped = Math.min(MAX_TREES, Math.max(1, Math.round(Number(count)) || DEFAULT_TREES))
  const walk = result && !result.error ? result : null

  return (
    <>
      <div className="tree-control">
        <label>
          Trees
          <input type="number" min={1} max={MAX_TREES} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={!ready || treesBusy}
          onClick={() => {
            setCount(String(clamped))
            onSuggest(clamped)
          }}
        >
          Suggest trees
        </button>
        <button type="button" disabled={!trees || treesBusy} onClick={onRemove}>
          Remove trees
        </button>
      </div>

      {treesBusy && <p className="hint">Placing trees…</p>}
      {!treesBusy && trees && (
        <>
          <p>
            {trees.points.length === 0
              ? `No street is in sun on ${fmtDate(trees.date)} at ${formatTime(trees.hours)}, so no trees were placed. Choose a time with sun.`
              : `${trees.points.length} ${trees.points.length === 1 ? 'tree' : 'trees'} along ${trees.segments} street ${trees.segments === 1 ? 'segment' : 'segments'}, chosen for ${fmtDate(trees.date)} at ${formatTime(trees.hours)}.`}
            {trees.points.length > 0 &&
              trees.points.length < trees.requested &&
              ` Only ${trees.points.length} of ${trees.requested} fitted the rule.`}
          </p>
          {trees.points.length > 0 && (
            <>
              {walk && areaShade ? (
                <table className="results">
                  <thead>
                    <tr>
                      <th>In shade</th>
                      <th>Without trees</th>
                      <th>With trees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {walk.areas.map((a, i) => (
                      <tr key={a.minutes}>
                        <td>
                          <span className="swatch" style={{ background: REACH_COLORS[i] }} />
                          {a.minutes} min
                        </td>
                        <td>{pct(areaShade[i].without)}</td>
                        <td>{pct(areaShade[i].with)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="hint">Click on the ground to start a walk and compare its shade with and without trees.</p>
              )}
              <p className="caption">
                Sunny street length now shaded by the trees: <strong>{fmt(Math.round(treeShadedLength))} m</strong>, on{' '}
                {when}, over the whole network.
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}

const ACTION_LABEL = {
  plant_tree: 'Planted a tree',
  plant_trees: 'Planted trees',
  remove_tree: 'Removed a tree', wait: 'Waited',
  error: 'Could not think',
}

// What the gardener noticed, in one line.
function noticed({ date, hours, altitude, top, scope, trees, maxTrees }) {
  const sun = altitude > 0 ? `sun ${Math.round(altitude)}°` : 'sun down'
  const sunniest = top
    ? `sunniest ${scope === 'walk' ? 'near the walk' : 'on the map'}: segment ${top.id}, ${top.sun_hours_11_17} h`
    : 'no street in sun'
  return `${fmtDate(date)} ${formatTime(hours)}, ${sun}; ${sunniest}; ${trees} of ${maxTrees} trees`
}

function Gardener({ gardener }) {
  const { offline, paused, demo, thinking, trees, maxTrees, log, togglePause, toggleDemo } = gardener
  if (offline) return <p className="hint">The gardener only thinks on localhost.</p>
  return (
    <>
      <div className="tree-control">
        <button type="button" onClick={togglePause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <span className="hint">
          {paused ? 'Paused' : thinking ? 'Thinking…' : 'Watching'} · {trees.length} of {maxTrees} trees
        </span>
        <label className="demo-toggle">
          <input type="checkbox" checked={demo} onChange={toggleDemo} />
          Demo mode
        </label>
      </div>
      {demo && (
        <p className="caption">
          Demo mode: up to {DEMO_PLANTS} trees per turn, a turn every {DEMO_AUTO_MS / 1000} seconds, up to{' '}
          {DEMO_MAX_GARDENER_TREES} trees, {DEMO_TREE_SCALE} times as big and bright green. The view stays on the whole city.
        </p>
      )}
      {log.length === 0 && (
        <p className="hint">It thinks when you start a walk, when you stop moving the time slider, and every {demo ? '20 seconds' : '2 minutes'}.</p>
      )}
      <ol className="gardener-log">
        {log.map((e) => (
          <li key={e.key} className={e.action}>
            <div className="when">
              {e.at} · {e.why}
            </div>
            <div className="noticed">{noticed(e.noticed)}</div>
            <div>
              <strong>
                {ACTION_LABEL[e.action]}
                {e.action === 'plant_tree' && ` on segment ${e.segment_id}`}
                {e.action === 'remove_tree' && ` (${e.tree_id})`}
              </strong>{' '}
              {e.reason}
            </div>
            {e.action === 'plant_trees' && (
              <ul className="plantings">
                {e.plantings.map((p, i) => (
                  <li key={i}>
                    Segment {p.segment_id}: {p.reason}
                  </li>
                ))}
              </ul>
            )}
            {e.note && <div className="note">{e.note}</div>}
          </li>
        ))}
      </ol>
    </>
  )
}

export default function Panel({
  result,
  busy,
  areaShade,
  date,
  hours,
  ready,
  trees,
  treesBusy,
  treeShadedLength,
  onSuggest,
  onRemove,
  gardener,
}) {
  const when = `${fmtDate(date)} at ${formatTime(hours)}`
  const hasTrees = trees?.points.length > 0 || gardener.trees.length > 0
  return (
    <aside className="panel">
      <h1>How far can you walk?</h1>
      <Results result={result} busy={busy} areaShade={areaShade} when={when} hasTrees={hasTrees} />

      <h2>Suggest trees</h2>
      <Trees
        ready={ready}
        result={result}
        areaShade={areaShade}
        trees={trees}
        treesBusy={treesBusy}
        treeShadedLength={treeShadedLength}
        when={when}
        onSuggest={onSuggest}
        onRemove={onRemove}
      />

      <h2>Gardener</h2>
      <Gardener gardener={gardener} />

      <h2>How this is worked out</h2>
      <ul className="method">
        <li>
          The walk starts at the street junction nearest to your click, if one is within {MAX_SNAP_M} m.
        </li>
        <li>
          It follows the pedestrian network at 4.8 km/h, that is {SPEED_M_PER_MIN} m per minute: {MINUTES.map((m) => `${m * SPEED_M_PER_MIN} m`).join(', ')} for{' '}
          {MINUTES.join(', ')} minutes. A street you can only partly walk counts up to where you stop.
        </li>
        <li>Each area is the streets reached plus a band of {BAND_M} m on each side, joined into one shape.</li>
        <li>A building counts if its footprint touches the area.</li>
        <li>
          Residents come from the 100 m census grid of Zensus 2022. Each cell that overlaps the area adds its
          residents times the share of the cell that lies inside. The sum is rounded to the nearest 10.
        </li>
        <li>
          A few cells have no published resident figure. They are not zero, so they are left out of the sum and
          counted next to it.
        </li>
      </ul>

      <h2>How shade is worked out</h2>
      <ul className="method">
        <li>The sun position is computed for Weimar with the NOAA solar equations, in local clock time (CEST in summer).</li>
        <li>
          A street point is in shade when a building, taken as a block of its full height, stands between it and the
          sun. Streets are checked every 2 m.
        </li>
        <li>
          Suggested trees: street segments at least half in sun at the chosen time are ranked by their hours of sun
          from {String(HEAT_FROM).padStart(2, '0')}:00 to {HEAT_TO}:00 that day, most first. Trees go along the top ones,
          at least {TREE_SPACING_M} m apart and {TREE_OFFSET_M} m from the centre line on the sun side, never in a
          building.
        </li>
        <li>
          Tree size is assumed, not measured: a round crown {2 * CROWN_RADIUS_M} m wide, {CROWN_CENTRE_M + CROWN_RADIUS_M} m
          tall in total. Only the crown casts shade, and it blocks the sun fully.
        </li>
        <li>
          The gardener (Claude Haiku, only when the app runs on localhost) sees the 10 sunniest segments of the walk,
          those within 10 minutes of the start first, with their hours of sun from{' '}
          {String(HEAT_FROM).padStart(2, '0')}:00 to {HEAT_TO}:00 counting all trees, the last walk starts and its own
          trees. Each turn it plants one tree, removes one of its own, or waits; at most {MAX_GARDENER_TREES} trees. A
          planted tree goes on that segment by the same rules as the suggested trees. Its trees are{' '}
          {GARDENER_TREE_SCALE} times as big: a crown {2 * CROWN_RADIUS_M * GARDENER_TREE_SCALE} m wide,{' '}
          {(CROWN_CENTRE_M + CROWN_RADIUS_M) * GARDENER_TREE_SCALE} m tall. Demo mode plants up to {DEMO_PLANTS} trees per
          turn, up to {DEMO_MAX_GARDENER_TREES} in all, and makes them {DEMO_TREE_SCALE} times as big; their shade counts at that
          size.
        </li>
        <li>Not included: existing trees, terrain, roof shapes, buildings outside the kit, and clouds.</li>
      </ul>

      <h2>Legend</h2>
      <ul className="legend">
        {MINUTES.map((m, i) => (
          <li key={m}>
            <span className="swatch" style={{ background: REACH_COLORS[i] }} />
            reached within {m} min
          </li>
        ))}
        <li>
          <span className="swatch" style={{ background: STREET_SUN }} />
          street in sun
        </li>
        <li>
          <span className="swatch" style={{ background: STREET_SHADE }} />
          street in shade
        </li>
        <li>
          <span className="swatch" style={{ background: TREE_CROWN }} />
          suggested tree
        </li>
        <li>
          <span className="swatch" style={{ background: gardener.demo ? DEMO_GARDENER_CROWN : GARDENER_CROWN }} />
          gardener tree
        </li>
        {USE_COLORS.map(([use, color, label]) => (
          <li key={use}>
            <span className="swatch" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
      <p className="hint">Drag to orbit, right-drag to pan, scroll to zoom.</p>
    </aside>
  )
}
