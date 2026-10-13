import {GRID, doubleArrow} from './catalog.mjs'

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
export const scale = (p, t) => [p[0] * t, p[1] * t]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
export const length = (p) => Math.hypot(...p)
export const unit = (p) => scale(p, 1 / (length(p) || 1))
export const normal = (p) => [-p[1], p[0]]
const fmt = (n) => Number(n.toFixed(2))
export const pathFromPoints = (points) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])},${fmt(p[1])}`).join(' ')

export function edgeCurve(from, to, edge) {
  const start = from.position,
    end = to.position
  if (edge.from === edge.to || length(sub(start, end)) < 0.1) {
    const direction = {top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0]}[
      edge.loopDirection
    ] || [0, -1]
    const radius = edge.loopSize || 60
    const center = add(start, scale(direction, radius))
    const initial = Math.atan2(-direction[1], -direction[0])
    const stretch = (v) => {
      if (edge.curve !== 'ellipse') return v
      const perpendicular = normal(direction)
      return add(
        scale(direction, v[0] * direction[0] + v[1] * direction[1]),
        scale(
          perpendicular,
          (v[0] * perpendicular[0] + v[1] * perpendicular[1]) * (edge.ellipseRatio ?? 1),
        ),
      )
    }
    return (t) => {
      const angle = initial + t * Math.PI * 2
      return {
        point: add(center, stretch([Math.cos(angle) * radius, Math.sin(angle) * radius])),
        tangent: unit(stretch([-Math.sin(angle), Math.cos(angle)])),
      }
    }
  }
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
  const control = add(
    scale(add(start, end), 0.5),
    scale(n, -length(delta) * Math.tan(((edge.bend || 0) * Math.PI) / 360)),
  )
  return (t) => ({
    point: add(
      add(scale(start, (1 - t) ** 2), scale(control, 2 * (1 - t) * t)),
      scale(end, t * t),
    ),
    tangent: unit(
      add(scale(sub(control, start), 2 * (1 - t)), scale(sub(end, control), 2 * t)),
    ),
  })
}

export function edgeGeometry(from, to, edge) {
  const curve = edgeCurve(from, to, edge)
  const samples = Array.from({length: 181}, (_, i) => curve(i / 180))
  let arc = 0
  const distances = samples.map((sample, i) => {
    if (i) arc += length(sub(sample.point, samples[i - 1].point))
    return arc
  })
  const trimmed =
    edge.from === edge.to
      ? 0
      : Math.min(
          0.08,
          Math.max(
            from.vertex === 'blob' ? 15 : from.size || 5,
            to.vertex === 'blob' ? 15 : to.size || 5,
          ) / Math.max(arc, 1),
        )
  const at = (ratio) => curve(trimmed + ratio * (1 - 2 * trimmed))
  const cycles = Math.max(2, Math.round(arc / (edge.line === 'gluon' ? 14 : 19)))
  const points = (wave = false, offset = 0) =>
    samples
      .map((sample, i) => {
        const t = i / 180
        if (t < trimmed || t > 1 - trimmed) return null
        const wavePhase = (distances[i] / Math.max(arc, 1)) * cycles * Math.PI * 2
        let p = add(sample.point, scale(normal(sample.tangent), offset))
        if (wave) {
          const amplitude = edge.line === 'gluon' ? 6.5 : 4
          p = add(p, scale(normal(sample.tangent), Math.sin(wavePhase) * amplitude))
          if (edge.line === 'gluon')
            p = add(p, scale(sample.tangent, (Math.cos(wavePhase) - 1) * 4))
        }
        return p
      })
      .filter(Boolean)
  const wavy = ['photon', 'charged-boson', 'gluon', 'graviton'].includes(edge.line)
  const paths = ['double', 'graviton'].includes(edge.line)
    ? [pathFromPoints(points(wavy, -2.7)), pathFromPoints(points(wavy, 2.7))]
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
      end = distanceAt(1 - trimmed)
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
            arrowAt(edge.arrowAt ?? (doubleArrow(edge.arrow) ? 0.35 : 0.5)),
            ['backward', 'backward-double'].includes(edge.arrow),
          ),
          ...(doubleArrow(edge.arrow)
            ? [
                arrowPolygon(
                  arrowAt(edge.arrowAt2 ?? 0.65),
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
      (edge.momentumPosition === 'left' ? -1 : 1) * (edge.momentumDistance ?? 32),
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
function axisIntersections(from, to, edge, component, coordinate) {
  const curve = edgeCurve(from, to, edge)
  const loop = edge.from === edge.to || length(sub(from.position, to.position)) < 0.1
  let roots = []
  if (loop || edge.curve === 'ellipse') {
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
      mid = curve(0.5).point[component],
      last = curve(1).point[component]
    const a = 2 * (first + last - 2 * mid),
      b = last - first - a,
      c = first - coordinate
    if (Math.abs(a) < 1e-9) {
      if (Math.abs(b) < 1e-9) return Math.abs(c) < 1e-9 ? null : []
      roots = [-c / b]
    } else {
      const discriminant = b * b - 4 * a * c
      if (discriminant < -1e-9) return []
      const root = Math.sqrt(Math.max(0, discriminant))
      roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    }
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
        ? 3
        : upper.width / 2
    const list = cuts.get(under) || []
    list.push(...crossing.points.map((point) => ({point, radius: gapSize / 2 + padding})))
    cuts.set(under, list)
  }
  return {crossings, cuts, geometries}
}

export function arrowPolygon({point, tangent}, reverse = false, size = 7) {
  const d = scale(tangent, reverse ? -1 : 1),
    n = normal(d)
  return [
    add(point, scale(d, size)),
    add(add(point, scale(d, -size * 0.65)), scale(n, size * 0.55)),
    add(add(point, scale(d, -size * 0.65)), scale(n, -size * 0.55)),
  ]
    .map((p) => p.map(fmt).join(','))
    .join(' ')
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
