import test from 'node:test'
import assert from 'node:assert/strict'
import {node, edge} from '../src/core/model.mjs'
import {edgeCurve} from '../src/core/geometry.mjs'

const close = (a, b, epsilon = 1e-9) =>
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < epsilon, `${a} ≠ ${b}`)
const cubicAt = (a, b, c, d, t) =>
  [0, 1].map(
    (i) =>
      (1 - t) ** 3 * a[i] +
      3 * (1 - t) ** 2 * t * b[i] +
      3 * (1 - t) * t * t * c[i] +
      t ** 3 * d[i],
  )

test('bent propagators are the cubic TikZ draws for bend left/right', () => {
  // TikZ: out=α, in=180-α relative to the chord, controls 0.3915·L away.
  const a = node(0, 0),
    b = node(200, 0)
  for (const [bend, side] of [
    [60, -1],
    [-60, 1],
  ]) {
    const alpha = Math.PI / 6,
      d = 0.3915 * 200
    const c1 = [d * Math.cos(alpha), side * d * Math.sin(alpha)],
      c2 = [200 - d * Math.cos(alpha), side * d * Math.sin(alpha)]
    const curve = edgeCurve(a, b, edge(a.id, b.id, 'plain', {bend}))
    for (const t of [0, 0.25, 0.5, 0.8, 1])
      close(curve(t).point, cubicAt([0, 0], c1, c2, [200, 0], t))
  }
})

test('straight propagators keep a uniform parameter for attached vertices', () => {
  const a = node(-100, 40),
    b = node(100, -60),
    curve = edgeCurve(a, b, edge(a.id, b.id))
  close(curve(0.3).point, [-40, 10])
})

import {emptyDiagram, annotation} from '../src/core/model.mjs'
import {toTeX} from '../src/core/tex.mjs'
import {templates, getTemplate} from '../src/core/templates.mjs'

// Three or more coordinates chained with `--` would be a sampled polyline.
const polyline = /\([^()]*\)\s*--\s*\([^()]*\)\s*--/
const assertNative = (tex, label) => {
  assert.doesNotMatch(tex, polyline, label)
  assert.ok(
    tex.split('\n').every((line) => line.length < 260),
    label,
  )
  assert.doesNotMatch(tex, /undefined|NaN|Infinity/, label)
}

test('the tadpole exports a native arc and a compact diagram', () => {
  const tex = toTeX(getTemplate('tadpole').create())
  assertNative(tex, 'tadpole')
  assert.match(
    tex,
    /\\draw \[scalar\] \(0, 0\) arc \[start angle=-90, delta angle=-360, radius=0\.813\] node \[pos=0\.5, auto\] \{\$k\$\};/,
  )
  assert.match(
    tex,
    /\\diagram\* \{\n {4}\(v0\) -- \[scalar\] \(v1\),\n {4}\(v1\) -- \[scalar\] \(v2\)\n {2}\};/,
  )
  assert.ok(tex.indexOf('arc [') < tex.indexOf('\\vertex'))
  assert.ok(tex.split('\n').length <= 12)
})

test('every template and feature combination exports without sampled paths', () => {
  for (const template of templates) assertNative(toTeX(template.create()), template.id)
  const a = node(-160, 0),
    b = node(160, 0),
    c = node(0, -160),
    d = node(0, 160),
    on = node(0, 0, {attachment: null})
  const document = {
    ...emptyDiagram(),
    nodes: [a, b, c, d],
    edges: [
      edge(a.id, b.id, 'fermion', {value: 'p', labelPosition: 'center'}),
      edge(c.id, d.id, 'photon', {bend: 40, momentum: 'k', momentumAt: 0.3}),
      edge(a.id, c.id, 'gluon', {curve: 'ellipse', ellipseRatio: 0.6, value: 'g'}),
      edge(b.id, d.id, 'fermion', {arrow: 'both', arrowAt: 0.2, arrowAt2: 0.8}),
      edge(b.id, b.id, 'photon', {loopAngle: 20, ellipseRatio: 1.4, momentum: 'q'}),
      edge(d.id, d.id, 'scalar', {curve: 'bezier', loopAngle: -70, insertion: true}),
      edge(c.id, b.id, 'charged-boson', {arrow: 'backward', width: 2, color: '#bc5557'}),
    ],
    annotations: [annotation(200, -200, '\\mathcal{M}')],
  }
  document.nodes.push({...on, attachment: {edge: document.edges[1].id, t: 0.4}})
  document.edges.push(edge(on.id, a.id, 'scalar'))
  const tex = toTeX(document, {standalone: true})
  assertNative(tex, 'combination')
  // Crossing gaps and inline labels clip native curves; nothing switches the
  // whole diagram to sampled paths.
  assert.match(tex, /\\clip [^\n]* circle/)
  assert.match(tex, /\\path \(v0\) edge \[fermion\] \(v1\);/)
  assert.match(tex, /\\diagram\*/)
  assert.match(tex, /rotate around=\{/)
  // Bare `with arrow` keys vanish inside \diagram*; each mark is a postaction.
  assert.match(
    tex,
    /postaction=\{\/tikzfeynman\/with arrow=0\.2\}, postaction=\{\/tikzfeynman\/with reversed arrow=0\.8\}/,
  )
  assert.doesNotMatch(tex, /[[,] \/tikzfeynman\/with/)
})

test('ellipse arcs and circular loops export their exact centres and radii', () => {
  const a = node(0, 0),
    b = node(160, -160)
  const half = toTeX({
    ...emptyDiagram(),
    nodes: [a, b],
    edges: [edge(a.id, b.id, 'plain', {curve: 'ellipse', ellipseRatio: 0.5})],
  })
  // The chord points 45° up-right; the half-ellipse bulges to its left.
  assert.match(
    half,
    /\\draw \[plain, rotate around=\{45:\(0, 0\)\}\] \(0, 0\) arc \[start angle=180, delta angle=-180, x radius=1\.414, y radius=0\.707\];/,
  )
  const circle = toTeX({
    ...emptyDiagram(),
    nodes: [a, b],
    edges: [edge(a.id, b.id, 'plain', {curve: 'ellipse', bend: -20})],
  })
  assert.match(circle, /arc \[start angle=-135, delta angle=180, radius=1\.414\]/)
  const loop = toTeX({
    ...emptyDiagram(),
    nodes: [a],
    edges: [
      edge(a.id, a.id, 'plain', {loopAngle: 30, loopClockwise: false, ellipseRatio: 2}),
    ],
  })
  assert.match(
    loop,
    /rotate around=\{30:\(0, 0\)\}\] \(0, 0\) arc \[start angle=180, delta angle=360, x radius=0\.75, y radius=1\.5\]/,
  )
})

import {parseDiagram} from '../src/core/model.mjs'

test('vertex label offsets round-trip, clamp and export as native label shifts', () => {
  const marked = node(0, 0, {vertex: 'dot', value: 'e^-', labelOffset: [16, -8]}),
    bare = node(160, 0, {vertex: 'none', value: '\\phi', labelOffset: [-4, 24]}),
    plain = node(320, 0, {vertex: 'none', value: '\\phi'})
  const document = {
    ...emptyDiagram(),
    nodes: [marked, bare, plain],
    edges: [edge(marked.id, bare.id), edge(bare.id, plain.id)],
  }
  assert.deepEqual(parseDiagram(JSON.stringify(document)), document)
  assert.equal(node(0, 0).labelOffset, null)
  const parsed = (labelOffset) =>
    parseDiagram({...emptyDiagram(), nodes: [{...plain, labelOffset}], edges: []})
      .nodes[0].labelOffset
  assert.equal(parsed([0, 0]), null)
  assert.equal(parsed(['1', 2]), null)
  assert.deepEqual(parsed([9999, -9999]), [400, -400])
  const tex = toTeX(document)
  // 8 canvas units are 1 mm; TikZ's y axis points up.
  assert.match(
    tex,
    /\\vertex\[dot, label=\{\[xshift=2mm, yshift=1mm\]above:\{\$e\^-\$\}\}\] \(v0\) at \(0, 0\) \{\};/,
  )
  assert.match(
    tex,
    /\\vertex\[label=\{\[xshift=-0\.5mm, yshift=-3mm\]center:\{\$\\phi\$\}\}\] \(v1\) at \(2, 0\) \{\};/,
  )
  assert.match(tex, /\\vertex \(v2\) at \(4, 0\) \{\$\\phi\$\};/)
})
