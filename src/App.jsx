import { useEffect, useMemo, useState } from 'react'
import City from './City.jsx'
import Panel from './Panel.jsx'
import SunControl from './SunControl.jsx'
import { loadKit } from './geo.js'
import { createReach } from './reach.js'
import { createShade } from './shade.js'
import { sunPosition } from './sun.js'
import { suggestTrees } from './trees.js'
import { useGardener } from './gardener.js'

// Worded as in public/data/SOURCES.md.
const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'

export default function App() {
  const [kit, setKit] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState('2026-07-21')
  const [hours, setHours] = useState(14)
  // Suggested trees: { points, segments, requested, date, hours }, or null.
  const [trees, setTrees] = useState(null)
  const [treesBusy, setTreesBusy] = useState(false)

  useEffect(() => {
    loadKit()
      .then(setKit)
      .catch((e) => setError(e.message))
  }, [])

  const compute = useMemo(() => (kit ? createReach(kit) : null), [kit])
  const shade = useMemo(() => (kit ? createShade(kit) : null), [kit])
  const sun = useMemo(() => sunPosition(date, hours), [date, hours])

  // The 3D shadows follow the slider at once. The street shade is worked out at most
  // once per screen frame, for the latest slider position, so the slider never stalls.
  const [shadeSun, setShadeSun] = useState(sun)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShadeSun(sun))
    return () => cancelAnimationFrame(id)
  }, [sun])
  const gardener = useGardener({ kit, shade, date, hours, sun, result, suggestedTrees: trees?.points })
  const gardenerPoints = gardener.points
  // Suggested and gardener trees both cast shade.
  const allTrees = useMemo(() => [...(trees?.points ?? []), ...gardenerPoints], [trees, gardenerPoints])

  const streetShade = useMemo(() => shade?.streetShade(shadeSun, allTrees), [shade, shadeSun, allTrees])
  const areaShade = useMemo(
    () =>
      shade && result && !result.error
        ? result.areas.map((a) => shade.shadedShare(a.segments, shadeSun, allTrees))
        : null,
    [shade, result, shadeSun, allTrees],
  )
  // Street length in sun without the trees that lies in tree shade now, in metres.
  const treeShadedLength = useMemo(() => {
    if (!allTrees.length || !streetShade) return 0
    let sum = 0
    shade.pieces.forEach((p, i) => {
      if (streetShade[i] === 2) sum += p.length
    })
    return sum
  }, [shade, streetShade, allTrees])

  const suggest = (count) => {
    setTreesBusy(true)
    // Let the panel show "Placing trees…" before the calculation starts.
    setTimeout(() => {
      const placed = suggestTrees(shade, kit.nodes, kit.edges, date, hours, count)
      setTrees({ ...placed, requested: count, date, hours })
      setTreesBusy(false)
    }, 20)
  }

  const pick = (x, y) => {
    setBusy(true)
    // Let the panel show "Walking…" before the calculation starts.
    setTimeout(() => {
      setResult(compute(x, y))
      setBusy(false)
    }, 20)
  }

  return (
    <div className="app">
      <div className="map">
        {kit && (
          <City
            kit={kit}
            result={result}
            onPick={pick}
            sun={sun}
            pieces={shade.pieces}
            streetShade={streetShade}
            trees={trees?.points}
            gardenerTrees={gardenerPoints}
            highlight={gardener.highlight}
            demo={gardener.demo}
          />
        )}
        {kit && <SunControl date={date} hours={hours} sun={sun} onDate={setDate} onHours={setHours} />}
        {!kit && !error && <p className="status">Loading the city kit…</p>}
        {error && <p className="status error">The city kit didn't load ({error}).</p>}
        <p className="attribution">{ATTRIBUTION}</p>
      </div>
      <Panel
        result={result}
        busy={busy}
        areaShade={areaShade}
        date={date}
        hours={hours}
        ready={!!kit}
        trees={trees}
        treesBusy={treesBusy}
        treeShadedLength={treeShadedLength}
        onSuggest={suggest}
        onRemove={() => setTrees(null)}
        gardener={gardener}
      />
    </div>
  )
}
