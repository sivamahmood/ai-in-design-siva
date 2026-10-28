// Quiet colours for the main use of each building, in legend order.
export const USE_COLORS = [
  ['residential', '#ddd3c4', 'residential'],
  ['undefined', '#cbcac5', 'undefined (use not known)'],
  ['service', '#c9cbb8', 'service'],
  ['education', '#b4c4a8', 'education'],
  ['food_and_drink', '#dcc0a0', 'food and drink'],
  ['office', '#b9b2a6', 'office'],
  ['retail', '#e2d3a3', 'retail'],
  ['accommodation', '#cdb6a6', 'accommodation'],
  ['entertainment', '#d4b5bd', 'entertainment'],
  ['civic', '#bdb3c6', 'civic'],
  ['health', '#b7cfc6', 'health'],
  ['culture', '#c6a9b4', 'culture'],
  ['transport', '#a9adb3', 'transport'],
  ['sport', '#bcc99b', 'sport'],
  ['light_industrial', '#a99e92', 'light industrial'],
]
export const useColor = Object.fromEntries(USE_COLORS.map(([use, color]) => [use, color]))

// One accent, darkest for the shortest walk: 5, 10 and 15 minutes.
export const REACH_COLORS = ['#1d4f91', '#4f80c4', '#9fbde6']

export const GROUND = '#f3f1ec'
// Streets in sun and in building shade.
export const STREET_SUN = '#d99a2b'
export const STREET_SHADE = '#4a4f63'
