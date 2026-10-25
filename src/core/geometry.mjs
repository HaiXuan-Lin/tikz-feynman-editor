import {GRID, doubleArrow} from './catalog.mjs'
import {
  vertexRadius,
  lineWidth,
  momentumDistance,
  TEX_POINTS_PER_UNIT,
  arrowPositions,
  DEFAULT_STROKE,
} from './styles.mjs'

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
export const scale = (p, t) => [p[0] * t, p[1] * t]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
export const length = (p) => Math.hypot(...p)
export const unit = (p) => scale(p, 1 / (length(p) || 1))
export const normal = (p) => [-p[1], p[0]]
const fmt = (n) => Number(n.toFixed(2))
export const pathFromPoints = (points) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])},${fmt(p[1])}`).join(' ')

// Angles follow TikZ: 0° points right and 90° points up, while screen y grows downward.
export const normalizeAngle = (degrees) => {
  const angle = ((((degrees + 180) % 360) + 360) % 360) - 180
  return angle === -180 ? 180 : angle
}
export const angleVector = (degrees) => {
  const radians = (degrees * Math.PI) / 180
  return [Math.cos(radians), -Math.sin(radians)]
}
export const vectorAngle = (p) =>
  normalizeAngle((Math.atan2(-p[1], p[0]) * 180) / Math.PI)
const angularDistance = (a, b) => Math.abs(normalizeAngle(a - b))
export const isLoop = (edge, from, to) =>
  edge.from === edge.to || length(sub(from.position, to.position)) < 0.1

// A TikZ loop leaves at `out`, returns from `in`, and uses `distance` for both
// Bézier controls. `loopSize` is half the loop's reach, matching the circle shape.
export function loopControls(edge) {
  const turn = edge.loopClockwise === false ? -1 : 1,
    angle = edge.loopAngle ?? 90,
    spread = edge.loopSpread ?? 45
  return {
    out: angle + turn * spread,
    in: angle - turn * spread,
    distance: (8 * (edge.loopSize || 60)) / (3 * Math.cos((spread * Math.PI) / 180)),
  }
}

const cubic = (a, b, c, d) => (t) => {
  const s = 1 - t
  return {
    point: [0, 1].map(
      (i) =>
        s * s * s * a[i] + 3 * s * s * t * b[i] + 3 * s * t * t * c[i] + t * t * t * d[i],
    ),
    tangent: unit(
      [0, 1].map(
        (i) =>
          3 * s * s * (b[i] - a[i]) +
          6 * s * t * (c[i] - b[i]) +
          3 * t * t * (d[i] - c[i]),
      ),
    ),
  }
}

function loopCurve(start, edge) {
  const turn = edge.loopClockwise === false ? -1 : 1
  if (edge.curve === 'ellipse') {
    // A circle (or ellipse) touching its vertex, as in textbook tadpoles.
    const direction = angleVector(edge.loopAngle ?? 90)
    const radius = edge.loopSize || 60
    const center = add(start, scale(direction, radius))
    const initial = Math.atan2(-direction[1], -direction[0])
    const perpendicular = normal(direction)
    const stretch = (v) =>
      add(
        scale(direction, v[0] * direction[0] + v[1] * direction[1]),
        scale(
          perpendicular,
          (v[0] * perpendicular[0] + v[1] * perpendicular[1]) * (edge.ellipseRatio ?? 1),
        ),
      )
    return (t) => {
      const angle = initial + turn * t * Math.PI * 2
      return {
        point: add(center, stretch([Math.cos(angle) * radius, Math.sin(angle) * radius])),
        tangent: unit(stretch(scale([-Math.sin(angle), Math.cos(angle)], turn))),
      }
    }
  }
  const loop = loopControls(edge)
  return cubic(
    start,
    add(start, scale(angleVector(loop.out), loop.distance)),
    add(start, scale(angleVector(loop.in), loop.distance)),
    start,
  )
}

// New loops go into the widest free direction around a vertex, preferring the top.
export function freeLoopAngle(document, id, ignore = null) {
  const nodes = new Map(document.nodes.map((n) => [n.id, n])),
    vertex = nodes.get(id)
  if (!vertex) return 90
  const taken = []
  for (const e of document.edges) {
    if (e.id === ignore || (e.from !== id && e.to !== id)) continue
    const from = nodes.get(e.from),
      to = nodes.get(e.to)
    if (!from || !to) continue
    if (isLoop(e, from, to)) {
      taken.push(e.loopAngle ?? 90)
      continue
    }
    const curve = edgeCurve(from, to, e)
    if (e.from === id) taken.push(vectorAngle(curve(0).tangent))
    if (e.to === id) taken.push(vectorAngle(scale(curve(1).tangent, -1)))
  }
  // Labels of marked vertices sit above them.
  if (vertex.value && vertex.vertex !== 'none') taken.push(90)
  if (!taken.length) return 90
  const sorted = taken.map((a) => ((a % 360) + 360) % 360).sort((a, b) => a - b)
  let best = null
  sorted.forEach((angle, i) => {
    const gap = (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360) - angle
    const candidate = normalizeAngle(Math.round((angle + gap / 2) / 5) * 5)
    const distance = angularDistance(candidate, 90)
    if (
      !best ||
      gap > best.gap + 1e-6 ||
      (Math.abs(gap - best.gap) <= 1e-6 && distance < best.distance)
    )
      best = {gap, angle: candidate, distance}
  })
  return best.angle
}

export function edgeCurve(from, to, edge) {
  const start = from.position,
    end = to.position
  if (isLoop(edge, from, to)) return loopCurve(start, edge)
  const delta = sub(end, start),
    n = normal(unit(delta))
  if (edge.curve === 'ellipse') {
    const height =
      (length(delta) / 2) * (edge.ellipseRatio ?? 1) * (edge.bend < 0 ? 1 : -1)
    return (t) => {
      const angle = Math.PI * t
      return {
        point: add(
          start,
          add(
            scale(delta, (1 - Math.cos(angle)) / 2),
            scale(n, height * Math.sin(angle)),
          ),
        ),
        tangent: unit(
          add(scale(delta, Math.sin(angle) / 2), scale(n, height * Math.cos(angle))),
        ),
      }
    }
  }
  if (!edge.bend)
    return (t) => ({point: add(start, scale(delta, t)), tangent: unit(delta)})
  // TikZ's `bend left=α` (exported with α = bend / 2): out=α and in=180-α
  // relative to the chord, both controls 0.3915 chord lengths away.
  const alpha = (edge.bend * Math.PI) / 360,
    u = unit(delta),
    left = scale(n, -1),
    distance = 0.3915 * length(delta)
  return cubic(
    start,
    add(
      start,
      scale(add(scale(u, Math.cos(alpha)), scale(left, Math.sin(alpha))), distance),
    ),
    add(
      end,
      scale(add(scale(u, -Math.cos(alpha)), scale(left, Math.sin(alpha))), distance),
    ),
    end,
  )
}

export function edgeGeometry(from, to, edge) {
  const curve = edgeCurve(from, to, edge)
  const samples = Array.from({length: 181}, (_, i) => curve(i / 180))
  let arc = 0
  const distances = samples.map((sample, i) => {
    if (i) arc += length(sub(sample.point, samples[i - 1].point))
    return arc
  })
  const loop = isLoop(edge, from, to)
  const trimmed = loop ? 0 : Math.min(0.45, vertexRadius(from) / Math.max(arc, 1))
  const endTrimmed = loop ? 0 : Math.min(0.45, vertexRadius(to) / Math.max(arc, 1))
  const at = (ratio) => curve(trimmed + ratio * (1 - trimmed - endTrimmed))
  const cycles = Math.max(1, Math.floor(arc / (edge.line === 'gluon' ? 12 : 16)))
  const points = (wave = false, offset = 0) =>
    samples
      .map((sample, i) => {
        const t = i / 180
        if (t < trimmed || t > 1 - endTrimmed) return null
        const wavePhase = (distances[i] / Math.max(arc, 1)) * cycles * Math.PI * 2
        let p = add(sample.point, scale(normal(sample.tangent), offset))
        if (wave) {
          const amplitude = edge.line === 'gluon' ? 2.5 / TEX_POINTS_PER_UNIT : 4
          p = add(p, scale(normal(sample.tangent), Math.sin(wavePhase) * amplitude))
          if (edge.line === 'gluon')
            p = add(
              p,
              scale(sample.tangent, (Math.cos(wavePhase) - 1) * 0.75 * amplitude),
            )
        }
        return p
      })
      .filter(Boolean)
  const wavy = ['photon', 'charged-boson', 'gluon', 'graviton'].includes(edge.line)
  const doubleOffset = (0.6 / TEX_POINTS_PER_UNIT + lineWidth(edge)) / 2
  const paths = ['double', 'graviton'].includes(edge.line)
    ? [
        pathFromPoints(points(wavy, -doubleOffset)),
        pathFromPoints(points(wavy, doubleOffset)),
      ]
    : [pathFromPoints(points(wavy))]
  // Percentages follow distance along the visible curve, including ellipses/loops.
  const distanceAt = (t) => {
    const index = t * (samples.length - 1),
      i = Math.floor(index)
    return (
      distances[i] + ((distances[i + 1] ?? distances[i]) - distances[i]) * (index - i)
    )
  }
  const arrowAt = (ratio) => {
    const start = distanceAt(trimmed),
      end = distanceAt(1 - endTrimmed)
    const target = start + ratio * (end - start)
    let i = 1
    while (i < distances.length - 1 && distances[i] < target) i++
    const fraction = (target - distances[i - 1]) / (distances[i] - distances[i - 1] || 1)
    return curve((i - 1 + fraction) / (samples.length - 1))
  }
  const arrows =
    edge.arrow === 'none'
      ? []
      : [
          arrowPolygon(
            arrowAt(edge.arrowAt ?? arrowPositions(edge.line, edge.arrow)[0]),
            ['backward', 'backward-double'].includes(edge.arrow),
          ),
          ...(doubleArrow(edge.arrow)
            ? [
                arrowPolygon(
                  arrowAt(edge.arrowAt2 ?? arrowPositions(edge.line, edge.arrow)[1]),
                  ['both', 'backward-double'].includes(edge.arrow),
                ),
              ]
            : []),
        ]
  const labelPoint = at(edge.labelAt || 0.5)
  const label = add(
    labelPoint.point,
    scale(
      normal(labelPoint.tangent),
      edge.labelPosition === 'center' ? 0 : edge.labelPosition === 'right' ? 19 : -19,
    ),
  )
  const momentumPoint = at(edge.momentumAt ?? 0.5)
  const momentum = add(
    momentumPoint.point,
    scale(
      normal(momentumPoint.tangent),
      (edge.momentumPosition === 'left' ? -1 : 1) * momentumDistance(edge),
    ),
  )
  const momentumDirection = momentumPoint.tangent
  return {
    paths,
    hitPath: pathFromPoints(points()),
    arrows,
    label,
    momentum,
    momentumLabel: add(
      momentum,
      scale(normal(momentumPoint.tangent), edge.momentumPosition === 'left' ? -17 : 17),
    ),
    momentumDirection,
    insertion: at(0.5),
    samples,
    arc,
  }
}

export function nearestEdge(document, point, tolerance = 14, exclude = new Set()) {
  const nodes = new Map(document.nodes.map((n) => [n.id, n]))
  let best = null
  for (const edge of document.edges) {
    if (exclude.has(edge.id) || !nodes.has(edge.from) || !nodes.has(edge.to)) continue
    const curve = edgeCurve(nodes.get(edge.from), nodes.get(edge.to), edge)
    for (let i = 0; i < 120; i++) {
      const a = curve(i / 120).point,
        b = curve((i + 1) / 120).point,
        d = sub(b, a),
        den = d[0] * d[0] + d[1] * d[1]
      if (den < 1e-10) continue
      const fraction = Math.max(
          0,
          Math.min(1, (sub(point, a)[0] * d[0] + sub(point, a)[1] * d[1]) / den),
        ),
        projection = add(a, scale(d, fraction)),
        distance = length(sub(point, projection)),
        t = (i + fraction) / 120
      if (
        t < 0.02 ||
        t > 0.98 ||
        distance > tolerance ||
        (best && distance >= best.distance)
      )
        continue
      best = {point: curve(t).point, distance, attachment: {edge: edge.id, t}, edge}
    }
  }
  return best
}

// Solve the actual curve against an axis, rather than projecting an already
// aligned cursor onto the curve (which would make the connection diagonal).
// Cubics bracket each sign change and bisect it; lines and arcs are closed-form.
function cubicRoots(curve, component, coordinate) {
  const value = (t) => curve(t).point[component] - coordinate,
    roots = [],
    steps = 240
  let t0 = 0.02,
    v0 = value(t0)
  for (let i = 1; i <= steps; i++) {
    const t1 = 0.02 + (0.96 * i) / steps,
      v1 = value(t1)
    if (v0 === 0) roots.push(t0)
    else if (v0 * v1 < 0) {
      let low = t0,
        high = t1,
        lowValue = v0
      for (let k = 0; k < 60; k++) {
        const middle = (low + high) / 2,
          middleValue = value(middle)
        if (lowValue * middleValue <= 0) high = middle
        else {
          low = middle
          lowValue = middleValue
        }
      }
      roots.push((low + high) / 2)
    }
    t0 = t1
    v0 = v1
  }
  return roots
}

function axisIntersections(from, to, edge, component, coordinate) {
  const curve = edgeCurve(from, to, edge)
  const loop = isLoop(edge, from, to)
  let roots = []
  if (edge.curve !== 'ellipse' && (loop || edge.bend))
    roots = cubicRoots(curve, component, coordinate)
  else if (loop || edge.curve === 'ellipse') {
    const first = curve(0).point[component],
      last = curve(loop ? 0.5 : 1).point[component]
    const center = (first + last) / 2,
      a = first - center
    const b = curve(loop ? 0.25 : 0.5).point[component] - center
    const radius = Math.hypot(a, b),
      value = coordinate - center
    if (radius < 1e-9) return Math.abs(value) < 1e-9 ? null : []
    if (Math.abs(value) > radius + 1e-9) return []
    const phase = Math.atan2(b, a),
      angle = Math.acos(Math.max(-1, Math.min(1, value / radius)))
    const period = loop ? 2 * Math.PI : Math.PI
    for (const sign of [-1, 1])
      for (let k = -1; k <= 2; k++)
        roots.push((phase + sign * angle + k * Math.PI * 2) / period)
  } else {
    const first = curve(0).point[component],
      change = curve(1).point[component] - first
    // A collinear edge has infinitely many valid axis intersections.
    if (Math.abs(change) < 1e-9) return Math.abs(first - coordinate) < 1e-9 ? null : []
    roots = [(coordinate - first) / change]
  }
  return roots.filter((t) => t >= 0.02 && t <= 0.98)
}

export function snapToGeometry(
  document,
  point,
  {
    anchors = [],
    axes = true,
    toEdges = true,
    tolerance = 14,
    exclude = new Set(),
    forceAxis = false,
  } = {},
) {
  const alignments = []
  if (axes || forceAxis)
    for (const anchor of anchors)
      for (const component of [0, 1]) {
        const distance = Math.abs(point[component] - anchor[component])
        if (!forceAxis && distance > tolerance) continue
        const aligned = [...point]
        aligned[component] = anchor[component]
        alignments.push({
          point: aligned,
          component,
          anchor,
          axis: component === 0 ? 'vertical' : 'horizontal',
          distance,
        })
      }
  alignments.sort((a, b) => a.distance - b.distance)
  if (forceAxis) alignments.splice(1)
  if (toEdges && alignments.length) {
    const nodes = new Map(document.nodes.map((n) => [n.id, n]))
    let best = null
    for (const alignment of alignments)
      for (const edge of document.edges) {
        if (exclude.has(edge.id) || !nodes.has(edge.from) || !nodes.has(edge.to)) continue
        const curve = edgeCurve(nodes.get(edge.from), nodes.get(edge.to), edge)
        const roots = axisIntersections(
          nodes.get(edge.from),
          nodes.get(edge.to),
          edge,
          alignment.component,
          alignment.anchor[alignment.component],
        )
        // A collinear edge has infinitely many valid axis intersections.
        const candidates =
          roots === null
            ? [
                nearestEdge({...document, edges: [edge]}, alignment.point, tolerance),
              ].filter(Boolean)
            : roots.map((t) => ({point: curve(t).point, attachment: {edge: edge.id, t}}))
        for (const candidate of candidates) {
          if (length(sub(candidate.point, alignment.point)) > tolerance) continue
          const distance = length(sub(candidate.point, point))
          if (!best || distance < best.distance)
            best = {
              ...candidate,
              axis: alignment.axis,
              anchor: alignment.anchor,
              distance,
            }
        }
      }
    if (best) return best
  }
  const projection =
    toEdges && !forceAxis ? nearestEdge(document, point, tolerance, exclude) : null
  if (projection) return {...projection, axis: null, anchor: null}
  return alignments[0]
    ? {...alignments[0], attachment: null}
    : {point: [...point], attachment: null, axis: null, anchor: null}
}

export function segmentIntersection(a, b, c, d) {
  const r = sub(b, a),
    s = sub(d, c),
    cross = (u, v) => u[0] * v[1] - u[1] * v[0],
    den = cross(r, s)
  if (Math.abs(den) < 1e-9) return null
  const delta = sub(c, a),
    t = cross(delta, s) / den,
    u = cross(delta, r) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(a, scale(r, t)) : null
}

// A spatial segment index avoids comparing every sampled curve with every other.
// Masks remove ink rather than painting white, preserving transparent SVG export.
export function crossingPlan(document) {
  const nodes = new Map(document.nodes.map((n) => [n.id, n])),
    geometries = new Map(),
    cells = new Map(),
    intersections = new Map(),
    checked = new Set(),
    cellSize = 48
  document.edges.forEach((e, index) => {
    if (!nodes.has(e.from) || !nodes.has(e.to)) return
    const geometry = edgeGeometry(nodes.get(e.from), nodes.get(e.to), e)
    geometries.set(e.id, geometry)
    for (let i = 1; i < geometry.samples.length; i++) {
      const a = geometry.samples[i - 1].point,
        b = geometry.samples[i].point,
        segment = {edge: e, index, segment: i, a, b}
      const minX = Math.floor(Math.min(a[0], b[0]) / cellSize),
        maxX = Math.floor(Math.max(a[0], b[0]) / cellSize),
        minY = Math.floor(Math.min(a[1], b[1]) / cellSize),
        maxY = Math.floor(Math.max(a[1], b[1]) / cellSize)
      for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++) {
          const id = `${x},${y}`,
            bucket = cells.get(id) || []
          for (const other of bucket) {
            if (other.edge.id === e.id) continue
            const signature = JSON.stringify([e.id, i, other.edge.id, other.segment])
            if (checked.has(signature)) continue
            checked.add(signature)
            const point = segmentIntersection(a, b, other.a, other.b)
            if (!point) continue
            if (
              document.nodes.some(
                (n) =>
                  length(sub(n.position, point)) <
                  Math.max(8, n.vertex === 'blob' ? n.size * 2.7 : n.size || 0),
              )
            )
              continue
            const pair = JSON.stringify([e.id, other.edge.id].sort()),
              list = intersections.get(pair) || []
            if (!list.some((p) => length(sub(p.point, point)) < 2))
              list.push({point, edges: [other.edge.id, e.id], defaultOver: e.id})
            intersections.set(pair, list)
          }
          bucket.push(segment)
          cells.set(id, bucket)
        }
    }
  })
  const overrides = new Map(
      (document.crossings || []).map((c) => [JSON.stringify([...c.edges].sort()), c]),
    ),
    edgeMap = new Map(document.edges.map((e) => [e.id, e])),
    cuts = new Map(),
    crossings = []
  for (const [pair, points] of intersections) {
    const saved = overrides.get(pair),
      first = points[0],
      over = saved?.over || first.defaultOver,
      under = first.edges.find((id) => id !== over),
      upper = edgeMap.get(over),
      lower = edgeMap.get(under)
    const enabled =
        (saved?.enabled ?? true) &&
        upper.crossingGap !== false &&
        lower.crossingGap !== false,
      gapSize = saved?.gapSize ?? upper.gapSize ?? 12
    const crossing = {
      edges: [...first.edges],
      over,
      under,
      enabled,
      gapSize,
      points: points.map((p) => p.point),
    }
    crossings.push(crossing)
    if (!enabled) continue
    const padding = ['photon', 'charged-boson', 'gluon', 'graviton'].includes(upper.line)
      ? 7
      : ['double'].includes(upper.line)
        ? lineWidth(upper) + 0.3 / TEX_POINTS_PER_UNIT
        : lineWidth(upper) / 2
    const list = cuts.get(under) || []
    list.push(...crossing.points.map((point) => ({point, radius: gapSize / 2 + padding})))
    cuts.set(under, list)
  }
  return {crossings, cuts, geometries}
}

// TikZ-Feynman's native 45-degree triangle with 1.5pt inner sep and -0.5mm xshift.
export function arrowPolygon({point, tangent}, reverse = false) {
  const size = 1.5 / TEX_POINTS_PER_UNIT,
    d = scale(tangent, reverse ? -1 : 1),
    n = normal(d),
    origin = add(point, scale(tangent, -4)),
    apex = (1 + 1 / Math.tan(Math.PI / 8)) * size,
    halfBase = (1 + 2 * Math.tan(Math.PI / 8)) * size
  return [
    add(origin, scale(d, apex)),
    add(origin, add(scale(d, -size), scale(n, halfBase))),
    add(origin, add(scale(d, -size), scale(n, -halfBase))),
  ]
    .map((p) => p.map(fmt).join(','))
    .join(' ')
}

export function momentumArrow({point, tangent}) {
  const w = DEFAULT_STROKE,
    length = 4.8 / TEX_POINTS_PER_UNIT,
    width = 0.75 * length,
    inset = 0.325 * length,
    frontMiter = 0.5 * w * Math.hypot((2 * length) / width, 1),
    frontAngle = Math.atan2(width / 2, length),
    backAngle = Math.atan2(width / 2, inset),
    miter = (0.5 * w) / Math.tan((backAngle - frontAngle) / 2),
    backX = miter * Math.cos((backAngle + frontAngle) / 2),
    halfHeight = width / 2 - miter * Math.sin((backAngle + frontAngle) / 2),
    notch = inset + 0.5 * w * Math.hypot((2 * inset) / width, 1),
    p = (x, y = 0) =>
      add(point, add(scale(tangent, x - length), scale(normal(tangent), y)))
  return {
    points: [
      p(length - frontMiter),
      p(backX, halfHeight),
      p(notch),
      p(backX, -halfHeight),
    ]
      .map((p) => p.map(fmt).join(','))
      .join(' '),
    lineEnd: p(notch - 0.25 * w),
  }
}

export function bounds(document, padding = 70) {
  let points = [
    ...document.nodes.map((n) => n.position),
    ...document.annotations.map((a) => a.position),
  ]
  for (const edge of document.edges) {
    const from = document.nodes.find((n) => n.id === edge.from),
      to = document.nodes.find((n) => n.id === edge.to)
    if (from && to)
      points.push(...edgeGeometry(from, to, edge).samples.map((s) => s.point))
  }
  if (!points.length)
    return {x: -GRID * 2, y: -GRID * 1.5, width: GRID * 4, height: GRID * 3}
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1])
  return {
    x: Math.min(...xs) - padding,
    y: Math.min(...ys) - padding,
    width: Math.max(...xs) - Math.min(...xs) + padding * 2,
    height: Math.max(...ys) - Math.min(...ys) + padding * 2,
  }
}
