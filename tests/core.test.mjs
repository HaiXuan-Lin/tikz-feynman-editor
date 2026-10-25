import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDiagram,
  emptyDiagram,
  node,
  edge,
  annotation,
  removeSelection,
  duplicateSelection,
  History,
  key,
} from '../src/core/model.mjs'
import {edgeGeometry, bounds} from '../src/core/geometry.mjs'
import {toTeX} from '../src/core/tex.mjs'
import {templates, getTemplate} from '../src/core/templates.mjs'
import {propagators} from '../src/core/catalog.mjs'

test('all templates round-trip with valid endpoints and no duplicate identities', () => {
  for (const template of templates) {
    const document = template.create()
    assert.deepEqual(parseDiagram(JSON.stringify(document)), document)
    const next = template.create()
    assert.notEqual(document.nodes[0].id, next.nodes[0].id)
  }
})
test('legacy index endpoints, grid positions and charge directions migrate', () => {
  const document = parseDiagram({
    nodes: [
      {position: [-2, 1], value: 'e^-'},
      {position: [1, 2], vertex: 'dot'},
    ],
    edges: [{from: 0, to: 1, line: 'fermion', charge: -1, bend: 30}],
  })
  assert.deepEqual(document.nodes[0].position, [-160, 80])
  assert.equal(document.edges[0].from, document.nodes[0].id)
  assert.equal(document.edges[0].line, 'antifermion')
  assert.equal(document.edges[0].arrow, 'backward')
})
test('invalid projects fail at the import boundary', () => {
  assert.throws(() => parseDiagram({nodes: [{position: [NaN, 0]}], edges: []}))
  assert.throws(() =>
    parseDiagram({nodes: [{position: [0, 0]}], edges: [{from: 0, to: 3}]}),
  )
  const document = getTemplate('qed').create()
  document.nodes[1].id = document.nodes[0].id
  assert.throws(() => parseDiagram(document))
  assert.throws(() => parseDiagram({...emptyDiagram(), annotations: {}}))
})
test('deleting a vertex removes incident lines and deleting an edge preserves vertices', () => {
  const document = getTemplate('qed').create(),
    id = document.nodes[1].id
  const deleted = removeSelection(document, [key('node', id)])
  assert.ok(!deleted.edges.some((e) => e.from === id || e.to === id))
  assert.equal(deleted.nodes.length, document.nodes.length - 1)
  assert.equal(
    removeSelection(document, [key('edge', document.edges[0].id)]).nodes.length,
    document.nodes.length,
  )
})
test('duplicate selection remaps internal edges including self-loops', () => {
  const document = getTemplate('tadpole').create(),
    selection = document.nodes.map((n) => key('node', n.id))
  const result = duplicateSelection(document, selection),
    added = result.document.nodes.slice(document.nodes.length)
  assert.equal(added.length, 3)
  assert.equal(new Set(result.document.nodes.map((n) => n.id)).size, 6)
  assert.ok(
    result.document.edges
      .slice(document.edges.length)
      .every(
        (e) => added.some((n) => n.id === e.from) && added.some((n) => n.id === e.to),
      ),
  )
  const oldLoop = document.edges.find((e) => e.from === e.to),
    newLoop = result.document.edges
      .slice(document.edges.length)
      .find((e) => e.from === e.to)
  assert.notEqual(oldLoop.from, newLoop.from)
})
test('history restores deleted data and discards redo after a divergent edit', () => {
  const first = getTemplate('qed').create(),
    history = new History(first),
    second = removeSelection(first, [key('node', first.nodes[0].id)])
  history.push(second)
  assert.deepEqual(history.undo(), first)
  assert.ok(history.canRedo)
  history.push({...first, title: 'new branch'})
  assert.equal(history.canRedo, false)
  assert.equal(history.undo().title, first.title)
})
test('straight, curved, parallel and self-loop propagators have finite visible geometry', () => {
  const from = node(0, 0),
    to = node(200, 0)
  for (const p of propagators)
    for (const bend of [-90, 0, 90]) {
      const geometry = edgeGeometry(from, to, edge(from.id, to.id, p.id, {bend}))
      assert.ok(geometry.arc > 190)
      assert.ok(
        geometry.paths.every(
          (path) =>
            !path.includes('NaN') && !path.includes('Infinity') && path.startsWith('M'),
        ),
      )
    }
  for (const loopAngle of [90, 0, -90, 180, 37.5]) {
    const geometry = edgeGeometry(
      from,
      from,
      edge(from.id, from.id, 'photon', {loopAngle}),
    )
    assert.ok(geometry.arc > 250)
    assert.ok(geometry.paths[0].length > 100)
  }
})
test('bounding box includes loop extents and empty diagrams stay finite', () => {
  const document = getTemplate('tadpole').create(),
    box = bounds(document, 0),
    loop = document.edges.find((e) => e.from === e.to)
  assert.ok(box.y <= -2 * loop.loopSize + 0.5)
  assert.ok(Object.values(bounds(emptyDiagram())).every(Number.isFinite))
})
test('TeX uses stable local names, native styles, insertion and colours', () => {
  const a = node(0, 0, {vertex: 'crossed_dot', color: '#bc5557'}),
    b = node(160, 0)
  const document = {
    ...emptyDiagram(),
    nodes: [a, b],
    edges: [
      edge(a.id, b.id, 'ghost', {
        momentum: 'k',
        momentumPosition: 'right',
        insertion: true,
      }),
    ],
    annotations: [annotation(0, -100, '\\mathcal{M}')],
  }
  const code = toTeX(document, {standalone: true})
  assert.match(code, /\\documentclass/)
  assert.match(code, /crossed dot/)
  assert.match(code, /ghost/)
  assert.match(code, /insertion/)
  assert.match(code, /momentum'/)
  assert.match(code, /definecolor/)
  assert.ok(!code.includes(a.id))
  assert.ok(!/undefined|NaN|Infinity/.test(code))
})
test('QED scattering vertices have one photon and two fermion legs', () => {
  const document = getTemplate('qed').create()
  for (const n of document.nodes.filter((n) => n.vertex === 'dot')) {
    const legs = document.edges.filter((e) => e.from === n.id || e.to === n.id)
    assert.equal(legs.filter((e) => e.line === 'photon').length, 1)
    assert.equal(legs.filter((e) => e.line === 'fermion').length, 2)
  }
})
