// The sun's position over Weimar, from the NOAA solar position equations
// (after Jean Meeus, Astronomical Algorithms). Angles are in degrees.

// Kit centre from kit.json.
const LAT = 50.982663
const LON = 11.324797

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

// Last Sunday of a month (0-based) as a UTC day number.
function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

// A Weimar clock time ("2026-07-21", 14.5) as a UTC timestamp. Summer time (CEST, UTC+2)
// runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October.
export function weimarTimeToUtc(dateStr, hours) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const local = Date.UTC(y, m - 1, d) + hours * 3600e3
  const summerStart = Date.UTC(y, 2, lastSunday(y, 2), 1)
  const summerEnd = Date.UTC(y, 9, lastSunday(y, 9), 1)
  const asSummer = local - 2 * 3600e3
  return asSummer >= summerStart && asSummer < summerEnd ? asSummer : local - 3600e3
}

// { altitude above the horizon, azimuth clockwise from north } at a UTC timestamp.
export function sunPositionAt(utcMs) {
  const jd = utcMs / 86400e3 + 2440587.5
  const T = (jd - 2451545) / 36525

  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C =
    Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(rad(3 * M)) * 0.000289
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega))
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(rad(omega))
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)))

  // Equation of time, in minutes.
  const y = Math.tan(rad(eps / 2)) ** 2
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M)),
    )

  const utcMinutes = (((utcMs / 60e3) % 1440) + 1440) % 1440
  const trueSolarMinutes = utcMinutes + eqTime + 4 * LON
  const hourAngle = rad(trueSolarMinutes / 4 - 180)

  const lat = rad(LAT)
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  let altitude = 90 - deg(Math.acos(Math.max(-1, Math.min(1, cosZenith))))
  // Air bends the light near the horizon, lifting the sun slightly (Bennett's formula).
  if (altitude > -1) altitude += 1.02 / Math.tan(rad(altitude + 10.3 / (altitude + 5.11))) / 60

  const azimuth =
    (deg(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))) +
      180) %
    360
  return { altitude, azimuth }
}

export const sunPosition = (dateStr, hours) => sunPositionAt(weimarTimeToUtc(dateStr, hours))

// Unit vector pointing at the sun in local metres: x east, y north, z up.
export function sunDirection({ altitude, azimuth }) {
  const alt = rad(altitude), az = rad(azimuth)
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compassPoint = (azimuth) => COMPASS[Math.round(azimuth / 22.5) % 16]
