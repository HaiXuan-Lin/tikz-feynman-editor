import {GRID, doubleArrow} from './catalog.mjs'

export const TEX_POINTS_PER_UNIT = 72.27 / 2.54 / GRID
export const DEFAULT_STROKE = 0.4 / TEX_POINTS_PER_UNIT
export const ink = (color) => color ?? '#000000'
export const vertexRadius = ({vertex, size}) => {
  if (vertex === 'none') return 0
  if (size != null) return size * (vertex === 'blob' ? 2.7 : 1)
  return vertex === 'blob' ? 30 : vertex === 'crossed_dot' ? 12 : 6
}
export const lineWidth = (edge) =>
  edge.width ?? (edge.line === 'ghost' ? 2 : 1) * DEFAULT_STROKE
export const lineDash = (edge) =>
  ['scalar', 'charged-scalar'].includes(edge.line)
    ? [3 / TEX_POINTS_PER_UNIT, 3 / TEX_POINTS_PER_UNIT]
    : edge.line === 'ghost'
      ? [lineWidth(edge), 2 / TEX_POINTS_PER_UNIT]
      : null
export const arrowPositions = (line, arrow) =>
  line === 'majorana' && arrow === 'both'
    ? [0.33, 0.73]
    : doubleArrow(arrow)
      ? [0.35, 0.65]
      : [0.5, 0.65]
export const momentumDistance = (edge) => edge.momentumDistance ?? 24
