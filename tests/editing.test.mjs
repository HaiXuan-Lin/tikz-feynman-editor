import test from 'node:test'
import assert from 'node:assert/strict'
import {
  node,
  edge,
  emptyDiagram,
  parseDiagram,
  key,
  setCrossing,
  reorderEdges,
  resolveAttachments,
  attachmentExclusions,
  removeSelection,
  duplicateSelection,
} from '../src/core/model.mjs'
import {
  crossingPlan,
  nearestEdge,
  edgeCurve,
  edgeGeometry,
  segmentIntersection,
  snapToGeometry,
} from '../src/core/geometry.mjs'
import {translate} from '../src/core/i18n.mjs'
import {toTeX} from '../src/core/tex.mjs'
function crossing() {
  const nodes = [node(-100, 0), node(100, 0), node(0, -100), node(0, 100)]
  return {
    ...emptyDiagram(),
    nodes,
    edges: [
      edge(nodes[0].id, nodes[1].id, 'plain'),
      edge(nodes[2].id, nodes[3].id, 'plain'),
    ],
  }
}
test('crossing gaps switch layers, disappear when disabled and survive serialization', () => {
  let doc = crossing(),
    plan = crossingPlan(doc)
  assert.equal(plan.crossings.length, 1)
  assert.equal(plan.cuts.get(doc.edges[0].id).length, 1)
  assert.deepEqual(plan.crossings[0].points, [[0, 0]])
  doc = setCrossing(doc, plan.crossings[0], {over: doc.edges[0].id, gapSize: 24})
  plan = crossingPlan(parseDiagram(JSON.stringify(doc)))
  assert.ok(plan.cuts.has(doc.edges[1].id))
  assert.ok(!plan.cuts.has(doc.edges[0].id))
  assert.ok(plan.cuts.get(doc.edges[1].id)[0].radius > 12)
  doc = reorderEdges(doc, [key('edge', doc.edges[1].id)], true)
  assert.equal(crossingPlan(doc).crossings[0].over, doc.edges[1].id)
  doc = setCrossing(doc, crossingPlan(doc).crossings[0], {enabled: false})
  assert.equal(crossingPlan(doc).cuts.size, 0)
  doc.edges[0].crossingGap = false
  assert.equal(crossingPlan(doc).cuts.size, 0)
})

test('axis snapping attaches at an exact horizontal or vertical intersection', () => {
  const a = node(-150, -100),
    b = node(150, 100)
  const parent = edge(a.id, b.id, 'plain')
  const doc = {...emptyDiagram(), nodes: [a, b], edges: [parent]}
  const vertical = snapToGeometry(doc, [37, 29], {anchors: [[40, -150]]})
  assert.equal(vertical.axis, 'vertical')
  assert.ok(Math.abs(vertical.point[0] - 40) < 1e-8)
  assert.ok(Math.abs(vertical.point[1] - 80 / 3) < 1e-8)
  assert.equal(vertical.attachment.edge, parent.id)
  const horizontal = snapToGeometry(doc, [75, 48], {anchors: [[-170, 50]]})
  assert.equal(horizontal.axis, 'horizontal')
  assert.ok(Math.abs(horizontal.point[1] - 50) < 1e-8)
  assert.ok(Math.abs(horizontal.point[0] - 75) < 1e-8)
  const disabled = snapToGeometry(doc, [37, 29], {anchors: [[40, -150]], axes: false})
  assert.equal(disabled.axis, null)
  assert.ok(Math.abs(disabled.point[0] - 40) > 0.5)
})

test('axis snapping works on Bézier curves, ellipse arcs, circles and TikZ loops', () => {
  const a = node(-100, 20),
    b = node(130, 90)
  for (const props of [
    {bend: 70},
    {curve: 'ellipse', ellipseRatio: 0.45},
    {curve: 'ellipse', ellipseRatio: 1.8, bend: -30},
    {curve: 'ellipse', ellipseRatio: 1.7, loopAngle: 0},
    {curve: 'bezier', loopAngle: 37.5, loopSpread: 55},
    {curve: 'bezier', loopAngle: -120, loopClockwise: false},
  ]) {
    const loop = props.loopAngle !== undefined
    const parent = edge(a.id, loop ? a.id : b.id, 'plain', props)
    const curve = edgeCurve(a, loop ? a : b, parent)
    const point = curve(0.36).point
    const doc = {...emptyDiagram(), nodes: [a, b], edges: [parent]}
    for (const component of [0, 1]) {
      const anchor = [...point]
      anchor[1 - component] -= 200
      const snapped = snapToGeometry(doc, [point[0] + 3, point[1] + 2], {
        anchors: [anchor],
      })
      assert.equal(snapped.attachment.edge, parent.id)
      assert.ok(Math.abs(snapped.point[component] - anchor[component]) < 1e-8)
      assert.deepEqual(snapped.point, curve(snapped.attachment.t).point)
    }
  }
})

test('axis snapping respects exclusions and Shift locks the nearest direction', () => {
  const doc = crossing()
  const snapped = snapToGeometry(doc, [8, 45], {
    anchors: [[0, 170]],
    exclude: new Set(doc.edges.map((e) => e.id)),
  })
  assert.equal(snapped.attachment, null)
  assert.deepEqual(snapped.point, [0, 45])
  const free = snapToGeometry(emptyDiagram(), [35, 110], {anchors: [[0, 0]]})
  assert.equal(free.axis, null)
  const locked = snapToGeometry(emptyDiagram(), [35, 110], {
    anchors: [[0, 0]],
    axes: false,
    forceAxis: true,
  })
  assert.equal(locked.axis, 'vertical')
  assert.deepEqual(locked.point, [0, 110])
})

test('ellipse arcs obey the ellipse equation and ratio 100% gives a circle', () => {
  const a = node(-80, 30),
    b = node(160, 210)
  const center = [40, 120],
    radius = 150,
    tangent = [0.8, 0.6],
    normal = [-0.6, 0.8]
  for (const ratio of [0.2, 1, 2.5])
    for (const bend of [-30, 30]) {
      const e = edge(a.id, b.id, 'plain', {curve: 'ellipse', ellipseRatio: ratio, bend})
      const curve = edgeCurve(a, b, e)
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const p = curve(t).point.map((v, i) => v - center[i])
        const x = p[0] * tangent[0] + p[1] * tangent[1]
        const y = p[0] * normal[0] + p[1] * normal[1]
        assert.ok(Math.abs((x / radius) ** 2 + (y / (radius * ratio)) ** 2 - 1) < 1e-10)
      }
      assert.deepEqual(curve(0).point, a.position)
      assert.ok(Math.hypot(...curve(1).point.map((v, i) => v - b.position[i])) < 1e-8)
    }
})

test('all arrow styles use their independent percentages and chosen directions', () => {
  const a = node(0, 0),
    b = node(200, 0)
  for (const [arrow, directions] of [
    ['none', []],
    ['forward', [1]],
    ['backward', [-1]],
    ['both', [1, -1]],
    ['forward-double', [1, 1]],
    ['backward-double', [-1, -1]],
  ]) {
    const e = edge(a.id, b.id, 'fermion', {arrow, arrowAt: 0.2, arrowAt2: 0.8})
    const arrows = edgeGeometry(a, b, e).arrows
    assert.equal(arrows.length, directions.length)
    arrows.forEach((polygon, i) => {
      const points = polygon.split(' ').map((p) => p.split(',').map(Number))
      const tip = points[0][0],
        base = (points[1][0] + points[2][0]) / 2
      const center = base + 4 + (directions[i] * 1.5) / (72.27 / 2.54 / 80)
      assert.equal(Math.sign(tip - base), directions[i])
      assert.ok(Math.abs(center - (6 + (i ? 0.8 : 0.2) * 188)) < 0.01)
    })
  }
  const majorana = edge(a.id, b.id, 'majorana', {arrow: 'backward', arrowAt: 0.7})
  assert.equal(edgeGeometry(a, b, majorana).arrows.length, 1)
})

test('new curve and arrow settings round-trip, migrate, duplicate and export', () => {
  const doc = crossing()
  doc.edges = [
    edge(doc.nodes[0].id, doc.nodes[1].id, 'photon', {
      curve: 'ellipse',
      ellipseRatio: 0.6,
      arrow: 'forward-double',
      arrowAt: 0.22,
      arrowAt2: 0.77,
    }),
  ]
  assert.deepEqual(parseDiagram(JSON.stringify(doc)), doc)
  const copied = duplicateSelection(doc, [
    key('edge', doc.edges[0].id),
  ]).document.edges.at(-1)
  assert.equal(copied.curve, 'ellipse')
  assert.equal(copied.arrowAt, 0.22)
  assert.equal(copied.arrowAt2, 0.77)
  const tex = toTeX(doc)
  assert.equal(tex.split('/tikzfeynman/with arrow=').length - 1, 2)
  assert.ok(!tex.includes('\\diagram*'))
  delete doc.edges[0].curve
  delete doc.edges[0].ellipseRatio
  delete doc.edges[0].arrowAt
  delete doc.edges[0].arrowAt2
  doc.edges[0].arrow = 'both'
  const restored = parseDiagram(doc).edges[0]
  assert.equal(restored.curve, 'bezier')
  assert.equal(restored.arrowAt, 0.35)
  assert.equal(restored.arrowAt2, 0.65)
  doc.edges[0].arrowAt = 12
  doc.edges[0].arrowAt2 = -4
  doc.edges[0].ellipseRatio = 10
  const bounded = parseDiagram(doc).edges[0]
  assert.equal(bounded.arrowAt, 0.99)
  assert.equal(bounded.arrowAt2, 0.01)
  assert.equal(bounded.ellipseRatio, 3)
})
test('vertex intersections and collinear edges never create separation gaps', () => {
  const doc = crossing()
  doc.nodes.push(node(0, 0))
  assert.equal(crossingPlan(doc).crossings.length, 0)
  assert.equal(segmentIntersection([0, 0], [100, 0], [20, 0], [80, 0]), null)
  doc.nodes.pop()
  doc.edges[1].from = doc.edges[0].from
  assert.equal(crossingPlan(doc).crossings.length, 0)
})
test('curved edges detect two distinct intersections away from vertices', () => {
  const doc = crossing()
  doc.edges[0].bend = 80
  doc.nodes[2].position = [-130, -25]
  doc.nodes[3].position = [130, -25]
  const plan = crossingPlan(doc)
  assert.equal(plan.crossings[0].points.length, 2)
  assert.equal(plan.cuts.get(doc.edges[0].id).length, 2)
})
test('snapped vertices follow curved edges and deletion detaches them', () => {
  const doc = crossing()
  doc.edges.pop()
  doc.edges[0].bend = 60
  const p = edgeCurve(doc.nodes[0], doc.nodes[1], doc.edges[0])(0.4).point
  const nearest = nearestEdge(doc, [p[0] + 1, p[1] + 3])
  assert.ok(nearest)
  assert.equal(nearest.attachment.edge, doc.edges[0].id)
  const attached = node(0, 0, {attachment: nearest.attachment})
  doc.nodes.push(attached)
  const moved = resolveAttachments({
    ...doc,
    nodes: doc.nodes.map((n, i) => (i === 0 ? {...n, position: [-200, 50]} : n)),
  })
  assert.deepEqual(
    moved.nodes.at(-1).position,
    edgeCurve(moved.nodes[0], moved.nodes[1], moved.edges[0])(nearest.attachment.t).point,
  )
  assert.deepEqual(parseDiagram(moved), moved)
  const deleted = removeSelection(moved, [key('edge', doc.edges[0].id)])
  assert.equal(deleted.nodes.at(-1).attachment, null)
  assert.deepEqual(deleted.nodes.at(-1).position, moved.nodes.at(-1).position)
})
test('attachment dependencies prevent cycles and copies remap their constraints', () => {
  const doc = crossing()
  doc.edges.pop()
  const attached = node(0, 0, {attachment: {edge: doc.edges[0].id, t: 0.4}})
  doc.nodes.push(attached)
  const dependent = edge(attached.id, doc.nodes[3].id)
  doc.edges.push(dependent)
  assert.ok(attachmentExclusions(doc, [doc.nodes[0].id]).has(dependent.id))
  const copy = resolveAttachments(
    duplicateSelection(
      doc,
      doc.nodes.map((n) => key('node', n.id)),
    ).document,
  )
  assert.notEqual(copy.nodes.at(-1).attachment.edge, attached.attachment.edge)
  doc.nodes[0].attachment = {edge: dependent.id, t: 0.5}
  assert.throws(() => resolveAttachments(doc), /Circular/)
})
test('inline labels stay on their curve; momentum side changes on vertical and diagonal lines', () => {
  const a = node(0, 0),
    b = node(0, 200),
    e = edge(a.id, b.id, 'fermion', {
      value: 'p',
      labelPosition: 'center',
      momentum: 'k',
      momentumPosition: 'left',
    })
  const left = edgeGeometry(a, b, e),
    right = edgeGeometry(a, b, {...e, momentumPosition: 'right'})
  assert.equal(left.label[0], 0)
  assert.ok(left.momentum[0] > 0)
  assert.ok(right.momentum[0] < 0)
  assert.ok(left.momentumLabel[0] > left.momentum[0])
  assert.ok(right.momentumLabel[0] < right.momentum[0])
  const moved = edgeGeometry(a, b, {...e, momentumAt: 0.75, momentumDistance: 60})
  assert.ok(moved.momentum[1] > left.momentum[1])
  assert.equal(moved.momentum[0], 60)
  const diagonal = edgeGeometry(a, node(200, 200), e)
  assert.ok(diagonal.momentum[0] > diagonal.label[0])
  assert.ok(diagonal.momentum[1] < diagonal.label[1])
})
test('LaTeX exports actual clipped geometry and inline math labels', () => {
  const doc = crossing()
  doc.edges[0].value = 'p_1'
  doc.edges[0].labelPosition = 'center'
  doc.edges[1].momentum = 'k'
  doc.edges[1].momentumAt = 0.7
  const tex = toTeX(doc, {standalone: true})
  assert.match(tex, /begin\{scope\}\[even odd rule\]/)
  assert.match(tex, /edgeLabel0.south west/)
  assert.match(tex, /\$p_1\$/)
  assert.match(tex, /\$k\$/)
  assert.match(tex, /\\vertex\[dot\] \(v0\) at \(-1\.25, 0\) \{\};/)
  assert.ok(tex.indexOf('\\vertex[dot') > tex.lastIndexOf('\\end{scope}'))
  assert.ok(!/undefined|NaN/.test(tex))
})
test('English and Chinese messages interpolate without translating user math', () => {
  assert.equal(translate('en', '动量位置'), 'Momentum position')
  assert.equal(translate('zh', 'Snap to edges'), '吸附线段')
  assert.equal(translate('en', '已插入{0}', '电子散射'), 'Inserted Electron scattering')
  assert.equal(translate('zh', 'Momentum along edge'), '动量沿线位置')
  assert.equal(translate('en', 'p_1 + \\gamma'), 'p_1 + \\gamma')
})
