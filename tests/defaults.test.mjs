import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDiagram, node, edge, parseDiagram} from '../src/core/model.mjs'
import {vertices, propagators} from '../src/core/catalog.mjs'
import {lineWidth, vertexRadius, TEX_POINTS_PER_UNIT} from '../src/core/styles.mjs'
import {toTeX} from '../src/core/tex.mjs'

function diagram(line = 'fermion', props = {}) {
  const a = node(80, 80, {vertex: 'none'}),
    b = node(160, 80, {vertex: 'none'})
  return {...emptyDiagram(), nodes: [a, b], edges: [edge(a.id, b.id, line, props)]}
}
// Reads native TikZ arcs back as ellipses: centre, radii, rotation and sweep.
function drawnArcs(tex) {
  const arc =
    /\\draw \[([^\]]*)\] \((-?[\d.]+), (-?[\d.]+)\) arc \[start angle=(-?[\d.]+), delta angle=(-?\d+), (?:radius=([\d.]+)|x radius=([\d.]+), y radius=([\d.]+))\]/g
  return [...tex.matchAll(arc)].map((m) => {
    const rotation = Number(m[1].match(/rotate around=\{(-?[\d.]+):/)?.[1] ?? 0),
      start = [Number(m[2]), Number(m[3])],
      rx = Number(m[6] ?? m[7]),
      ry = Number(m[6] ?? m[8]),
      angle = (Number(m[4]) * Math.PI) / 180,
      turn = (rotation * Math.PI) / 180
    // The start point sits at `start angle` on the ellipse in the rotated frame.
    const local = [rx * Math.cos(angle), ry * Math.sin(angle)]
    const centre = [
      start[0] - (local[0] * Math.cos(turn) - local[1] * Math.sin(turn)),
      start[1] - (local[0] * Math.sin(turn) + local[1] * Math.cos(turn)),
    ]
    return {options: m[1], start, centre, rx, ry, rotation, sweep: Number(m[5])}
  })
}

test('default appearance inherits TikZ-Feynman without exported numeric overrides', () => {
  for (const p of propagators) {
    const doc = diagram(p.id),
      tex = toTeX(doc)
    assert.equal(doc.edges[0].width, null)
    assert.equal(doc.edges[0].color, null)
    assert.equal(doc.edges[0].momentumDistance, null)
    assert.ok(
      !/line width=|line cap=|line join=|draw=|fill=|pattern=|minimum size=/.test(tex),
      p.id,
    )
    assert.match(tex, /\\diagram\*/)
    assert.ok(
      Math.abs(
        lineWidth(doc.edges[0]) * TEX_POINTS_PER_UNIT - (p.id === 'ghost' ? 0.8 : 0.4),
      ) < 1e-10,
    )
  }
  for (const v of vertices) {
    const doc = diagram()
    doc.nodes[0] = node(80, 80, {vertex: v.id})
    doc.edges[0].from = doc.nodes[0].id
    const tex = toTeX(doc)
    assert.equal(doc.nodes[0].size, null)
    assert.doesNotMatch(tex, /minimum size=|pattern=none|fill=white/)
    if (v.id !== 'none') assert.ok(tex.includes('[' + v.id.replaceAll('_', ' ') + ']'))
  }
  assert.equal(vertexRadius({vertex: 'dot', size: null}), 6)
  assert.equal(vertexRadius({vertex: 'crossed_dot', size: null}), 12)
  assert.equal(vertexRadius({vertex: 'blob', size: null}), 30)
})

test('manual overrides survive saving and reset to inheritance', () => {
  const doc = diagram('scalar', {width: 1.8, color: '#bc5557'})
  doc.nodes[0].vertex = 'blob'
  doc.nodes[0].size = 5
  const restored = parseDiagram(JSON.stringify(doc))
  assert.deepEqual(restored, doc)
  assert.match(toTeX(restored), /line width=0.64pt/)
  assert.match(toTeX(restored), /minimum size=9.603pt/)
  assert.match(toTeX(restored), /definecolor/)
  restored.edges[0].width = null
  restored.edges[0].color = null
  restored.nodes[0].size = null
  assert.doesNotMatch(toTeX(restored), /line width=|minimum size=|definecolor/)
})

test('old editor-imposed defaults migrate, while genuine custom settings remain', () => {
  const doc = diagram()
  delete doc.styleDefaults
  doc.nodes[0].size = 5
  doc.nodes[0].color = '#282a30'
  doc.edges[0].width = 1.8
  doc.edges[0].color = '#282a30'
  doc.edges[0].momentumDistance = 32
  let restored = parseDiagram(doc)
  assert.equal(restored.nodes[0].size, null)
  assert.equal(restored.nodes[0].color, null)
  assert.equal(restored.edges[0].width, null)
  assert.equal(restored.edges[0].color, null)
  assert.equal(restored.edges[0].momentumDistance, null)
  doc.nodes[0].size = 9
  doc.edges[0].width = 3
  doc.edges[0].color = '#5674bd'
  restored = parseDiagram(doc)
  assert.equal(restored.nodes[0].size, 9)
  assert.equal(restored.edges[0].width, 3)
  assert.equal(restored.edges[0].color, '#5674bd')
})

test('reported 25px left loop exports as a native closed arc with native arrow style', () => {
  const doc = diagram()
  doc.edges.push(
    edge(doc.nodes[0].id, doc.nodes[0].id, 'fermion', {
      loopAngle: 180,
      loopSize: 25,
    }),
  )
  const tex = toTeX(doc, {standalone: true}),
    [loop] = drawnArcs(tex)
  assert.equal(loop.options, 'fermion')
  assert.deepEqual(loop.start, [1, -1])
  assert.equal(Math.abs(loop.sweep), 360)
  assert.ok(Math.abs(loop.centre[0] - loop.rx - 0.375) < 0.002)
  assert.ok(Math.abs(loop.centre[0] + loop.rx - 1) < 0.002)
  assert.match(tex, /\\diagram\* \{\n {4}\(v0\) -- \[fermion\] \(v1\)\n {2}\};/)
  assert.doesNotMatch(tex, /line width=|minimum size=|arrow size=/)
})

test('all loop directions, radii and ellipse ratios preserve analytic extents', () => {
  for (const [direction, dx, dy] of [
    ['top', 0, 1],
    ['right', 1, 0],
    ['bottom', 0, -1],
    ['left', -1, 0],
  ])
    for (const radius of [25, 60, 200])
      for (const ratio of [0.5, 1, 2]) {
        const doc = diagram('scalar')
        doc.edges = [
          edge(doc.nodes[0].id, doc.nodes[0].id, 'scalar', {
            loopAngle: {top: 90, right: 0, bottom: -90, left: 180}[direction],
            loopSize: radius,
            curve: 'ellipse',
            ellipseRatio: ratio,
          }),
        ]
        const [loop] = drawnArcs(toTeX(doc)),
          r = radius / 80
        assert.equal(Math.abs(loop.sweep), 360)
        const rx = dx ? r : r * ratio,
          ry = dy ? r : r * ratio,
          turn = (loop.rotation * Math.PI) / 180,
          // Half extents of the (possibly rotated) exported ellipse.
          halfX = Math.hypot(loop.rx * Math.cos(turn), loop.ry * Math.sin(turn)),
          halfY = Math.hypot(loop.rx * Math.sin(turn), loop.ry * Math.cos(turn)),
          expected = [
            1 + dx * r - rx,
            1 + dx * r + rx,
            -1 + dy * r - ry,
            -1 + dy * r + ry,
          ],
          actual = [
            loop.centre[0] - halfX,
            loop.centre[0] + halfX,
            loop.centre[1] - halfY,
            loop.centre[1] + halfY,
          ]
        actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 0.002))
      }
})
