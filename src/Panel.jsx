// The side panel: results for 5, 10 and 15 minutes, the method in plain words, and the legend.
import { BAND_M, MAX_SNAP_M, MINUTES, SPEED_M_PER_MIN } from './reach.js'
import { REACH_COLORS, STREET_SHADE, STREET_SUN, USE_COLORS } from './palette.js'
import { formatTime } from './SunControl.jsx'

const fmt = (n) => n.toLocaleString('en-GB')
const fmtDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function Results({ result, busy, areaShade, when }) {
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
              <td>{areaShade ? `${Math.round(areaShade[i] * 100)} %` : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">In shade: share of the walked street length in building shade on {when}.</p>
    </>
  )
}

export default function Panel({ result, busy, areaShade, date, hours }) {
  const when = `${fmtDate(date)} at ${formatTime(hours)}`
  return (
    <aside className="panel">
      <h1>How far can you walk?</h1>
      <Results result={result} busy={busy} areaShade={areaShade} when={when} />

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
        <li>Not included: trees, terrain, roof shapes, buildings outside the kit, and clouds.</li>
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
