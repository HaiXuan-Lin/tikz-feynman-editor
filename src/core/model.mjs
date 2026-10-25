import {GRID, lineStyle, vertices, propagators, arrowStyles} from './catalog.mjs'
import {arrowPositions, TEX_POINTS_PER_UNIT} from './styles.mjs'
import {edgeCurve, normalizeAngle} from './geometry.mjs'

let sequence = 0
export const uid = (prefix) =>
  `${prefix}${Date.now().toString(36)}${(++sequence).toString(36)}`
export const clone = (value) => JSON.parse(JSON.stringify(value))
export const emptyDiagram = () => ({
  version: 2,
  styleDefaults: 'tikz-feynman',
  title: 'Untitled diagram',
  nodes: [],
  edges: [],
  annotations: [],
  crossings: [],
})
export const node = (x, y, props = {}) => ({
  id: uid('v'),
  position: [x, y],
  value: '',
  vertex: 'dot',
  color: null,
  size: null,
  attachment: null,
  ...props,
})
export const edge = (from, to, line = 'fermion', props = {}) => ({
  id: uid('e'),
  from,
  to,
  line,
  arrow: lineStyle(line).arrow,
  arrowAt: arrowPositions(line, props.arrow ?? lineStyle(line).arrow)[0],
  arrowAt2: arrowPositions(line, props.arrow ?? lineStyle(line).arrow)[1],
  value: '',
  momentum: '',
  bend: 0,
  // Loops default to circles touching their vertex, as in quiver and textbooks.
  curve: from === to ? 'ellipse' : 'bezier',
  ellipseRatio: 1,
  labelPosition: 'left',
  labelAt: 0.5,
  momentumPosition: 'left',
  momentumAt: 0.5,
  momentumDistance: null,
  crossingGap: true,
  gapSize: 12,
  color: null,
  width: null,
  loopAngle: 90,
  loopClockwise: true,
  loopSpread: 45,
  loopSize: 60,
  insertion: false,
  ...props,
})
export const annotation = (x, y, value = '\\mathcal{M} =') => ({
  id: uid('t'),
  position: [x, y],
  value,
  color: null,
  size: 20,
})
export const key = (kind, id) => `${kind}:${id}`
export const selected = (selection, kind, id) => selection.includes(key(kind, id))
export const snap = (position, enabled = true) =>
  enabled ? position.map((x) => (Math.round(x / (GRID / 2)) * GRID) / 2) : position

const bounded = (value, fallback, min, max) =>
  Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback
const text = (value) => (typeof value === 'string' ? value.slice(0, 10000) : '')
const position = (value) => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(
      (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 100000,
    )
  )
    throw new Error('顶点坐标无效。')
  return [...value]
}

const legacyLoopAngles = new Map([
  ['top', 90],
  ['right', 0],
  ['bottom', -90],
  ['left', 180],
])

// Version 1 stored grid coordinates and index-based endpoints. Both compressed
// links and saved JSON enter through this migration and validation boundary.
export function parseDiagram(input) {
  const source = typeof input === 'string' ? JSON.parse(input) : input
  if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.edges))
    throw new Error('项目必须包含 nodes 和 edges。')
  if (
    source.nodes.length > 3000 ||
    source.edges.length > 6000 ||
    (source.annotations || []).length > 1000
  )
    throw new Error('项目超过支持的图形数量。')
  if (source.version != null && ![1, 2].includes(source.version))
    throw new Error('不支持此项目版本。')
  const nativeDefaults = source.styleDefaults === 'tikz-feynman'
  // Older projects stored editor-imposed defaults as numbers. Preserve their
  // custom values, while migrating the old defaults to package inheritance.
  const inherited = (value, oldDefault, min, max) =>
    value == null || (!nativeDefaults && Number(value) === oldDefault)
      ? null
      : bounded(value, null, min, max)
  const color = (value) =>
    !value || (!nativeDefaults && value === '#282a30')
      ? null
      : /^#[0-9a-f]{6}$/i.test(value)
        ? value
        : null
  const legacy = source.version !== 2
  const ids = new Set()
  const nodes = source.nodes.map((n) => {
    const id = legacy ? uid('v') : text(n.id)
    if (!id || ids.has(id)) throw new Error('顶点 ID 缺失或重复。')
    ids.add(id)
    return node(0, 0, {
      id,
      position: position(n.position).map((x) => x * (legacy ? GRID : 1)),
      value: text(n.value),
      vertex: vertices.some((v) => v.id === n.vertex) ? n.vertex : 'none',
      color: color(n.color),
      size: inherited(n.size, 5, 0.1, 200),
      attachment:
        !legacy && n.attachment
          ? {edge: text(n.attachment.edge), t: bounded(n.attachment.t, 0.5, 0.02, 0.98)}
          : null,
    })
  })
  const edgeIds = new Set()
  const edges = source.edges.map((e) => {
    const from = legacy ? nodes[e.from]?.id : e.from
    const to = legacy ? nodes[e.to]?.id : e.to
    if (!ids.has(from) || !ids.has(to)) throw new Error('传播子的端点不存在。')
    let line = e.line || 'plain'
    if (legacy && line === 'fermion')
      line = e.charge === -1 ? 'antifermion' : e.charge === 1 ? 'fermion' : 'plain'
    if (legacy && line === 'scalar' && e.charge) line = 'charged-scalar'
    if (legacy && line === 'photon' && e.charge) line = 'charged-boson'
    if (!propagators.some((p) => p.id === line)) line = 'plain'
    const id = legacy ? uid('e') : text(e.id)
    if (!id || edgeIds.has(id)) throw new Error('传播子 ID 缺失或重复。')
    edgeIds.add(id)
    // Loops saved before loopAngle existed were always drawn as circles.
    const circularLoop = from === to && e.loopAngle == null
    return edge(from, to, line, {
      id,
      arrow:
        !nativeDefaults && line === 'ghost' && e.arrow === 'forward'
          ? 'none'
          : arrowStyles.includes(e.arrow)
            ? e.arrow
            : legacy && e.charge === -1
              ? 'backward'
              : lineStyle(line).arrow,
      arrowAt: bounded(
        !nativeDefaults && line === 'majorana' && e.arrow === 'both' && e.arrowAt === 0.35
          ? 0.33
          : e.arrowAt,
        arrowPositions(
          line,
          arrowStyles.includes(e.arrow) ? e.arrow : lineStyle(line).arrow,
        )[0],
        0.01,
        0.99,
      ),
      arrowAt2: bounded(
        !nativeDefaults &&
          line === 'majorana' &&
          e.arrow === 'both' &&
          e.arrowAt2 === 0.65
          ? 0.73
          : e.arrowAt2,
        arrowPositions(line, e.arrow ?? lineStyle(line).arrow)[1],
        0.01,
        0.99,
      ),
      value: text(e.value),
      momentum: text(e.momentum),
      bend: bounded(e.bend, 0, -90, 90),
      curve: circularLoop || e.curve === 'ellipse' ? 'ellipse' : 'bezier',
      ellipseRatio:
        circularLoop && e.curve !== 'ellipse' ? 1 : bounded(e.ellipseRatio, 1, 0.1, 3),
      labelPosition: ['left', 'center', 'right'].includes(e.labelPosition)
        ? e.labelPosition
        : 'left',
      labelAt: bounded(e.labelAt, 0.5, 0.1, 0.9),
      momentumPosition: e.momentumPosition === 'right' ? 'right' : 'left',
      momentumAt: bounded(e.momentumAt, 0.5, 0.1, 0.9),
      momentumDistance: inherited(e.momentumDistance, 32, 0, 100),
      crossingGap: e.crossingGap !== false,
      gapSize: bounded(e.gapSize, 12, 4, 40),
      color: color(e.color),
      width: inherited(e.width, 1.8, 0.1 / TEX_POINTS_PER_UNIT, 6 / TEX_POINTS_PER_UNIT),
      // Earlier projects stored one of four loop directions.
      loopAngle: normalizeAngle(
        bounded(e.loopAngle, legacyLoopAngles.get(e.loopDirection) ?? 90, -360, 360),
      ),
      loopClockwise: e.loopClockwise !== false,
      loopSpread: bounded(e.loopSpread, 45, 15, 75),
      loopSize: bounded(e.loopSize, 60, 25, 200),
      insertion: Boolean(e.insertion),
    })
  })
  if (source.annotations != null && !Array.isArray(source.annotations))
    throw new Error('文字标注格式无效。')
  const annotationIds = new Set()
  const annotations = (source.annotations || []).map((a) => {
    const id = text(a.id)
    if (!id || annotationIds.has(id)) throw new Error('标注 ID 缺失或重复。')
    annotationIds.add(id)
    return {
      id,
      position: position(a.position),
      value: text(a.value),
      color: color(a.color),
      size: bounded(a.size, 20, 12, 40),
    }
  })
  if (source.crossings != null && !Array.isArray(source.crossings))
    throw new Error('Invalid crossing settings.')
  const crossings = (source.crossings || [])
    .slice(0, 10000)
    .filter(
      (c) =>
        Array.isArray(c.edges) &&
        c.edges.length === 2 &&
        c.edges.every((id) => edgeIds.has(id)) &&
        c.edges.includes(c.over),
    )
    .map((c) => ({
      edges: [...c.edges],
      over: c.over,
      enabled: c.enabled !== false,
      gapSize: bounded(c.gapSize, 12, 4, 40),
    }))
  for (const n of nodes)
    if (
      n.attachment &&
      (!edgeIds.has(n.attachment.edge) ||
        edges.some(
          (e) => e.id === n.attachment.edge && (e.from === n.id || e.to === n.id),
        ))
    )
      throw new Error('Invalid vertex attachment.')
  return resolveAttachments({
    version: 2,
    styleDefaults: 'tikz-feynman',
    title: text(source.title) || 'Imported diagram',
    nodes,
    edges,
    annotations,
    crossings,
  })
}

export function resolveAttachments(document) {
  const nodes = new Map(document.nodes.map((n) => [n.id, n])),
    edges = new Map(document.edges.map((e) => [e.id, e])),
    resolved = new Map(),
    visiting = new Set()
  const resolve = (id) => {
    if (resolved.has(id)) return resolved.get(id)
    const n = nodes.get(id)
    if (!n) return null
    if (visiting.has(id)) throw new Error('Circular vertex attachment.')
    visiting.add(id)
    let next = n
    if (n.attachment) {
      const e = edges.get(n.attachment.edge)
      if (e) {
        const from = resolve(e.from),
          to = resolve(e.to)
        if (from && to)
          next = {...n, position: edgeCurve(from, to, e)(n.attachment.t).point}
      } else next = {...n, attachment: null}
    }
    visiting.delete(id)
    resolved.set(id, next)
    return next
  }
  return {...document, nodes: document.nodes.map((n) => resolve(n.id))}
}

// Exclude edges that depend on a moving vertex, preventing attachment cycles.
export function attachmentExclusions(document, nodeIDs) {
  const dependent = new Set(nodeIDs)
  let changed = true
  while (changed) {
    changed = false
    for (const n of document.nodes) {
      const e = n.attachment && document.edges.find((e) => e.id === n.attachment.edge)
      if (e && !dependent.has(n.id) && (dependent.has(e.from) || dependent.has(e.to))) {
        dependent.add(n.id)
        changed = true
      }
    }
  }
  return new Set(
    document.edges
      .filter((e) => dependent.has(e.from) || dependent.has(e.to))
      .map((e) => e.id),
  )
}

export function setCrossing(document, crossing, changes) {
  const matches = (c) =>
    c.edges.length === 2 && c.edges.every((id) => crossing.edges.includes(id))
  return {
    ...document,
    crossings: [
      ...(document.crossings || []).filter((c) => !matches(c)),
      {
        edges: [...crossing.edges],
        over: crossing.over,
        enabled: crossing.enabled,
        gapSize: crossing.gapSize,
        ...changes,
      },
    ],
  }
}

export function reorderEdges(document, selection, front) {
  const chosen = document.edges.filter((e) => selected(selection, 'edge', e.id)),
    other = document.edges.filter((e) => !selected(selection, 'edge', e.id))
  const ids = new Set(chosen.map((e) => e.id))
  return {
    ...document,
    edges: front ? [...other, ...chosen] : [...chosen, ...other],
    crossings: (document.crossings || []).map((c) => {
      const match = c.edges.filter((id) => ids.has(id))
      return match.length === 1
        ? {...c, over: front ? match[0] : c.edges.find((id) => id !== match[0])}
        : c
    }),
  }
}

export function removeSelection(document, selection) {
  const nodes = document.nodes.filter((n) => !selected(selection, 'node', n.id))
  const ids = new Set(nodes.map((n) => n.id))
  return {
    ...document,
    nodes: nodes.map((n) =>
      n.attachment &&
      !document.edges.some(
        (e) =>
          e.id === n.attachment.edge &&
          !selected(selection, 'edge', e.id) &&
          ids.has(e.from) &&
          ids.has(e.to),
      )
        ? {...n, attachment: null}
        : n,
    ),
    edges: document.edges.filter(
      (e) => ids.has(e.from) && ids.has(e.to) && !selected(selection, 'edge', e.id),
    ),
    annotations: document.annotations.filter((a) => !selected(selection, 'text', a.id)),
    crossings: (document.crossings || []).filter((c) =>
      c.edges.every((id) =>
        document.edges.some(
          (e) =>
            e.id === id &&
            !selected(selection, 'edge', e.id) &&
            ids.has(e.from) &&
            ids.has(e.to),
        ),
      ),
    ),
  }
}

export function duplicateSelection(document, selection, delta = [40, 40]) {
  const nodes = document.nodes.filter((n) => selected(selection, 'node', n.id))
  const edges = document.edges.filter(
    (e) =>
      selected(selection, 'edge', e.id) ||
      (nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to)),
  )
  const map = new Map(nodes.map((n) => [n.id, uid('v')]))
  const edgeMap = new Map(edges.map((e) => [e.id, uid('e')]))
  // Selected edges can be duplicated in place, including parallel lines.
  const copies = nodes.map((n) => ({
    ...clone(n),
    id: map.get(n.id),
    position: n.position.map((x, i) => x + delta[i]),
    attachment:
      n.attachment && edgeMap.has(n.attachment.edge)
        ? {...n.attachment, edge: edgeMap.get(n.attachment.edge)}
        : null,
  }))
  const lines = edges.map((e) => ({
    ...clone(e),
    id: edgeMap.get(e.id),
    from: map.get(e.from) || e.from,
    to: map.get(e.to) || e.to,
    bend: map.size ? e.bend : e.bend + 25,
  }))
  const annotations = document.annotations
    .filter((a) => selected(selection, 'text', a.id))
    .map((a) => ({
      ...clone(a),
      id: uid('t'),
      position: a.position.map((x, i) => x + delta[i]),
    }))
  return {
    document: {
      ...document,
      nodes: [...document.nodes, ...copies],
      edges: [...document.edges, ...lines],
      annotations: [...document.annotations, ...annotations],
      crossings: [
        ...(document.crossings || []),
        ...(document.crossings || [])
          .filter((c) => c.edges.every((id) => edgeMap.has(id)))
          .map((c) => ({
            ...c,
            edges: c.edges.map((id) => edgeMap.get(id)),
            over: edgeMap.get(c.over),
          })),
      ],
    },
    selection: [
      ...copies.map((n) => key('node', n.id)),
      ...lines.map((e) => key('edge', e.id)),
      ...annotations.map((a) => key('text', a.id)),
    ],
  }
}

export class History {
  constructor(initial, limit = 100) {
    this.entries = [clone(initial)]
    this.index = 0
    this.limit = limit
  }
  push(document) {
    if (JSON.stringify(document) === JSON.stringify(this.entries[this.index])) return
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(clone(document))
    if (this.entries.length > this.limit) this.entries.shift()
    this.index = this.entries.length - 1
  }
  undo() {
    if (this.index > 0) this.index--
    return clone(this.entries[this.index])
  }
  redo() {
    if (this.index < this.entries.length - 1) this.index++
    return clone(this.entries[this.index])
  }
  get canUndo() {
    return this.index > 0
  }
  get canRedo() {
    return this.index < this.entries.length - 1
  }
}
