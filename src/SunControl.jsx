// Date and time for the sun, with a read-out of where the sun stands.
import { compassPoint } from './sun.js'

export const formatTime = (hours) =>
  `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`

export default function SunControl({ date, hours, sun, onDate, onHours }) {
  return (
    <div className="sun-control">
      <label>
        Date
        <input type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
      </label>
      <label>
        Time <strong>{formatTime(hours)}</strong>
        <input
          type="range"
          min={8}
          max={20}
          step={0.25}
          value={hours}
          onChange={(e) => onHours(Number(e.target.value))}
        />
      </label>
      <p>
        {sun.altitude > 0
          ? `Sun ${Math.round(sun.altitude)}° high, from ${compassPoint(sun.azimuth)}`
          : 'The sun is below the horizon'}
      </p>
    </div>
  )
}
