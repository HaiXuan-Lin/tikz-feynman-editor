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
function drawnPaths(tex) {
  return [...tex.matchAll(/\\draw\[[^\]]*\] ([^;]+);/g)].map((match) =>
    [...match[1].matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map((p) => [
      Number(p[1]),
      Number(p[2]),
    ]),
  )
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

test('reported 25px left loop exports as a closed curve with native arrow style', () => {
  const doc = diagram()
  doc.edges.push(
    edge(doc.nodes[0].id, doc.nodes[0].id, 'fermion', {
      loopDirection: 'left',
      loopSize: 25,
    }),
  )
  const tex = toTeX(doc, {standalone: true}),
    paths = drawnPaths(tex)
  assert.equal(paths.length, 2)
  const loop = paths[1]
  assert.deepEqual(loop[0], [1, -1])
  assert.deepEqual(loop.at(-1), loop[0])
  assert.equal(Math.min(...loop.map((p) => p[0])), 0.375)
  assert.equal(Math.max(...loop.map((p) => p[0])), 1)
  assert.equal(tex.split('/tikzfeynman/with arrow=').length - 1, 2)
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
            loopDirection: direction,
            loopSize: radius,
            curve: 'ellipse',
            ellipseRatio: ratio,
          }),
        ]
        const loop = drawnPaths(toTeX(doc))[0],
          r = radius / 80
        assert.deepEqual(loop.at(-1), loop[0])
        const rx = dx ? r : r * ratio,
          ry = dy ? r : r * ratio,
          expected = [
            1 + dx * r - rx,
            1 + dx * r + rx,
            -1 + dy * r - ry,
            -1 + dy * r + ry,
          ],
          actual = [
            Math.min(...loop.map((p) => p[0])),
            Math.max(...loop.map((p) => p[0])),
            Math.min(...loop.map((p) => p[1])),
            Math.max(...loop.map((p) => p[1])),
          ]
        actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 0.001))
      }
})
