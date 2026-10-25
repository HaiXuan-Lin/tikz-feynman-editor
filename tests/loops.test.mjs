import test from 'node:test'
import assert from 'node:assert/strict'
import {node, edge, emptyDiagram, parseDiagram} from '../src/core/model.mjs'
import {
  edgeCurve,
  edgeGeometry,
  freeLoopAngle,
  loopControls,
  angleVector,
  vectorAngle,
} from '../src/core/geometry.mjs'
import {toTeX} from '../src/core/tex.mjs'

const close = (a, b, epsilon = 1e-9) =>
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < epsilon, `${a} ≠ ${b}`)

test('TikZ loops use the out/in/distance Bézier that TikZ draws', () => {
  const v = node(40, -20)
  for (const loopAngle of [90, 0, -90, 180, 37.5, -151])
    for (const loopClockwise of [true, false]) {
      const e = edge(v.id, v.id, 'plain', {
        curve: 'bezier',
        loopAngle,
        loopClockwise,
        loopSize: 50,
      })
      const curve = edgeCurve(v, v, e),
        {out, in: into, distance} = loopControls(e)
      const c1 = v.position.map((x, i) => x + angleVector(out)[i] * distance),
        c2 = v.position.map((x, i) => x + angleVector(into)[i] * distance)
      for (const t of [0, 0.2, 0.5, 0.9, 1]) {
        const s = 1 - t
        close(
          curve(t).point,
          v.position.map(
            (x, i) =>
              s ** 3 * x + 3 * s * s * t * c1[i] + 3 * s * t * t * c2[i] + t ** 3 * x,
          ),
        )
      }
      // The loop leaves along `out`, peaks along its axis at twice its size.
      assert.ok(
        Math.abs(vectorAngle(curve(0).tangent) - vectorAngle(angleVector(out))) < 1e-9,
      )
      const apex = curve(0.5).point.map((x, i) => x - v.position[i])
      assert.ok(Math.abs(Math.hypot(...apex) - 100) < 1e-9)
      assert.ok(Math.abs(vectorAngle(apex) - loopAngle) < 1e-9)
      // Clockwise loops cross their apex towards the right of the loop axis.
      const right = angleVector(loopAngle - 90),
        tangent = curve(0.5).tangent
      assert.equal(
        Math.sign(tangent[0] * right[0] + tangent[1] * right[1]),
        loopClockwise ? 1 : -1,
      )
    }
})

test('circle loops touch their vertex and follow the chosen orientation', () => {
  const v = node(0, 0)
  for (const loopClockwise of [true, false]) {
    const e = edge(v.id, v.id, 'plain', {curve: 'ellipse', loopAngle: 30, loopClockwise})
    const curve = edgeCurve(v, v, e)
    close(curve(0).point, v.position)
    close(curve(1).point, v.position)
    close(
      curve(0.5).point,
      angleVector(30).map((x) => x * 120),
    )
    const right = angleVector(-60)
    const tangent = curve(0.5).tangent
    assert.equal(
      Math.sign(tangent[0] * right[0] + tangent[1] * right[1]),
      loopClockwise ? 1 : -1,
    )
  }
})

test('default loops are circles; labels and momenta sit outside clockwise loops', () => {
  const v = node(0, 0)
  assert.equal(edge(v.id, v.id).curve, 'ellipse')
  assert.equal(edge(v.id, node(80, 0).id).curve, 'bezier')
  for (const curve of ['ellipse', 'bezier'])
    for (const loopAngle of [90, 0, -135]) {
      const g = edgeGeometry(
        v,
        v,
        edge(v.id, v.id, 'fermion', {curve, loopAngle, value: 'k', momentum: 'p'}),
      )
      const axis = angleVector(loopAngle),
        reach = (p) => p[0] * axis[0] + p[1] * axis[1]
      assert.ok(Math.abs(reach(g.insertion.point) - 120) < 1e-9)
      assert.ok(reach(g.label) > reach(g.insertion.point))
      assert.ok(reach(g.momentum) > reach(g.insertion.point))
    }
})

test('new loops take the widest free direction around a vertex', () => {
  const center = node(0, 0),
    left = node(-160, 0),
    right = node(160, 0),
    up = node(0, -160)
  const document = {...emptyDiagram(), nodes: [center, left, right, up], edges: []}
  assert.equal(freeLoopAngle(document, center.id), 90)
  document.edges.push(edge(left.id, center.id), edge(center.id, right.id))
  assert.equal(freeLoopAngle(document, center.id), 90)
  document.edges.push(edge(center.id, up.id))
  assert.equal(freeLoopAngle(document, center.id), -90)
  document.edges.pop()
  document.edges.push(edge(center.id, center.id, 'plain', {loopAngle: 90}))
  assert.equal(freeLoopAngle(document, center.id), -90)
  assert.equal(freeLoopAngle(document, right.id), 0)
  // Bent legs count by their tangent at the vertex, not by their far endpoint.
  const leg = edge(center.id, right.id, 'plain', {bend: 90}),
    bent = {...document, edges: [leg]}
  const leaving = vectorAngle(edgeCurve(center, right, leg)(0).tangent)
  // TikZ's bend left=45 leaves the vertex at 45°.
  assert.ok(Math.abs(leaving - 45) < 1e-9)
  assert.ok(Math.abs(freeLoopAngle(bent, center.id) - (leaving - 180)) <= 2.5)
})

test('loop settings migrate, clamp and round-trip', () => {
  const v = node(0, 0)
  const legacy = (props) =>
    parseDiagram({
      ...emptyDiagram(),
      nodes: [v],
      edges: [edge(v.id, v.id, 'plain', props)],
    }).edges[0]
  for (const [loopDirection, angle] of [
    ['top', 90],
    ['right', 0],
    ['bottom', -90],
    ['left', 180],
    ['constructor', 90],
  ]) {
    const e = edge(v.id, v.id, 'plain', {loopDirection, curve: 'bezier', ellipseRatio: 2})
    delete e.loopAngle
    const migrated = parseDiagram({...emptyDiagram(), nodes: [v], edges: [e]}).edges[0]
    assert.equal(migrated.loopAngle, angle)
    // Older loops were always drawn as circles, whatever their stored curve.
    assert.equal(migrated.curve, 'ellipse')
    assert.equal(migrated.ellipseRatio, 1)
  }
  assert.equal(legacy({loopAngle: 270}).loopAngle, -90)
  assert.equal(legacy({loopAngle: -180}).loopAngle, 180)
  assert.equal(legacy({loopAngle: 37.25}).loopAngle, 37.25)
  assert.equal(legacy({loopSpread: 89}).loopSpread, 75)
  assert.equal(legacy({loopClockwise: false}).loopClockwise, false)
  const document = {
    ...emptyDiagram(),
    nodes: [v],
    edges: [edge(v.id, v.id, 'gluon', {loopAngle: -33.5, loopClockwise: false})],
  }
  assert.deepEqual(parseDiagram(JSON.stringify(document)), document)
})

test('TeX loops export the on-screen orientation without TikZ loop arrows', () => {
  const v = node(0, 0)
  const tex = (props) =>
    toTeX({
      ...emptyDiagram(),
      nodes: [v],
      edges: [edge(v.id, v.id, 'fermion', {curve: 'bezier', ...props})],
    })
  // TikZ-Feynman drops self-edges inside \diagram*, so loops are separate paths
  // drawn from the vertex centre before the vertices that cover their ends.
  const top = tex({})
  assert.match(
    top,
    /\\path \(0, 0\) edge \[fermion, out=135, in=45, distance=2\.828cm\] \(0, 0\);/,
  )
  assert.ok(top.indexOf('\\path') < top.indexOf('\\vertex'))
  assert.doesNotMatch(top, /\\diagram\*/)
  const leg = node(160, 0)
  const withLeg = toTeX({
    ...emptyDiagram(),
    nodes: [v, leg],
    edges: [
      edge(v.id, leg.id),
      edge(v.id, v.id, 'photon', {curve: 'bezier', value: 'k', momentum: 'p'}),
    ],
  })
  assert.match(withLeg, /\\diagram\* \{\n    \(v0\) -- \[fermion[^\n]*\] \(v1\)\n  \};/)
  assert.match(
    withLeg,
    /\\path \(0, 0\) edge \[photon, [^\n]*edge label=\{\$k\$\}[^\n]*momentum=\{\$p\$\}/,
  )
  assert.match(tex({loopClockwise: false}), /out=45, in=135, distance=2\.828cm/)
  assert.match(tex({loopAngle: -30, loopSpread: 30}), /out=0, in=300, distance=/)
  assert.doesNotMatch(tex({loopAngle: 12.5}), /\bloop\b|NaN|undefined/)
  // Circles cannot be one TikZ curve, so they export as exact paths.
  assert.doesNotMatch(tex({curve: 'ellipse'}), /\\diagram\*/)
})
