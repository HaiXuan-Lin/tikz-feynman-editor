import {lineStyle, doubleArrow} from './catalog.mjs'
import {
  crossingPlan,
  bounds,
  add,
  scale,
  sub,
  length,
  isLoop,
  loopControls,
  vectorAngle,
  normalizeAngle,
} from './geometry.mjs'
import {parseDiagram} from './model.mjs'
import {TEX_POINTS_PER_UNIT, vertexRadius, arrowPositions} from './styles.mjs'

const number = (value) => Number(value.toFixed(3))
const point = (p) => '(' + number(p[0] / 80) + ', ' + number(-p[1] / 80) + ')'
const centimetres = (value) => number(value / 80)
const degrees = (value) => number(((value % 360) + 360) % 360)
const widthOption = (e) =>
  e.width == null ? [] : ['line width=' + number(e.width * TEX_POINTS_PER_UNIT) + 'pt']

// TikZ-Feynman styles carry their own arrows only at their native positions;
// any other arrangement uses the arrowless style plus explicit arrow marks.
const nativeStyles = {
  fermion: {none: 'plain', forward: 'fermion', backward: 'anti fermion'},
  antifermion: {none: 'plain', forward: 'fermion', backward: 'anti fermion'},
  'charged-scalar': {
    none: 'scalar',
    forward: 'charged scalar',
    backward: 'anti charged scalar',
  },
  'charged-boson': {
    none: 'photon',
    forward: 'charged boson',
    backward: 'anti charged boson',
  },
  majorana: {both: 'majorana'},
}
const arrowlessStyles = {
  fermion: 'plain',
  antifermion: 'plain',
  majorana: 'plain',
  'charged-scalar': 'scalar',
  'charged-boson': 'photon',
}
function propagatorStyle(e) {
  const positions = arrowPositions(e.line, e.arrow)
  const nativePositions =
    e.arrow === 'none' ||
    (e.arrowAt === positions[0] && (!doubleArrow(e.arrow) || e.arrowAt2 === positions[1]))
  const native = nativeStyles[e.line]?.[e.arrow]
  if (native && nativePositions) return [native]
  const style = [arrowlessStyles[e.line] || lineStyle(e.line).tex]
  if (e.arrow === 'none') return style
  const marks = [[e.arrowAt, ['backward', 'backward-double'].includes(e.arrow)]]
  if (doubleArrow(e.arrow))
    marks.push([e.arrowAt2, ['both', 'backward-double'].includes(e.arrow)])
  // Inside \diagram* the bare `with arrow` keys are silently dropped, so each
  // mark runs as its own postaction, which works for every path.
  for (const [at, reverse] of marks)
    style.push(
      'postaction={/tikzfeynman/with ' +
        (reverse ? 'reversed ' : '') +
        'arrow=' +
        number(at) +
        '}',
    )
  return style
}

export function toTeX(document, {standalone = false, shareURL = ''} = {}) {
  document = parseDiagram(document)
  const names = new Map(document.nodes.map((n, i) => [n.id, 'v' + i])),
    nodeMap = new Map(document.nodes.map((n) => [n.id, n])),
    colors = new Map()
  const colorOption = (item) => {
    if (item.color == null) return []
    if (!colors.has(item.color)) colors.set(item.color, 'diagramcolor' + colors.size)
    return ['color=' + colors.get(item.color)]
  }
  const command = (name, options, body) =>
    '  \\' +
    name +
    (options.length ? ' [' + options.join(', ') + ']' : '') +
    ' ' +
    body +
    ';'
  const nodes = document.nodes.map((n) => {
    const options = n.vertex === 'none' ? [] : [n.vertex.replace(/_/g, ' ')]
    options.push(...colorOption(n))
    if (n.vertex !== 'none' && n.size != null)
      options.push(
        'minimum size=' + number(2 * vertexRadius(n) * TEX_POINTS_PER_UNIT) + 'pt',
      )
    // Label offsets become native shifts: 8 canvas units are 1 mm, and an
    // unmarked vertex moves its text into a centred label so lines still meet it.
    const shift = n.labelOffset
      ? '[xshift=' +
        number(n.labelOffset[0] / 8) +
        'mm, yshift=' +
        number(-n.labelOffset[1] / 8) +
        'mm]'
      : ''
    if (n.value && (n.vertex !== 'none' || shift))
      options.push(
        'label={' +
          shift +
          (n.vertex === 'none' ? 'center' : 'above') +
          ':{$' +
          n.value +
          '$}}',
      )
    // The explicit empty body preserves marked vertices in diagram*.
    const label = n.value && n.vertex === 'none' && !shift ? '{$' + n.value + '$}' : '{}'
    return (
      '  \\vertex' +
      (options.length ? '[' + options.join(', ') + ']' : '') +
      ' (' +
      names.get(n.id) +
      ') at ' +
      point(n.position) +
      ' ' +
      label +
      ';'
    )
  })
  const plan = crossingPlan(document),
    box = bounds(document, 200),
    outer =
      point([box.x, box.y + box.height]) +
      ' rectangle ' +
      point([box.x + box.width, box.y])
  // Arcs and loops start at vertex centres, so they precede the vertices that
  // cover their ends; other propagators connect named vertices.
  const centred = [],
    diagram = [],
    named = []
  document.edges.forEach((e, i) => {
    const from = nodeMap.get(e.from),
      to = nodeMap.get(e.to),
      g = plan.geometries.get(e.id)
    if (!from || !to || !g) return
    const loop = isLoop(e, from, to),
      arc = e.curve === 'ellipse',
      inline = Boolean(e.value) && e.labelPosition === 'center',
      color = colorOption(e)
    const style = [...propagatorStyle(e), ...widthOption(e), ...color]
    if (e.insertion) style.push('insertion=0.5')
    // TikZ-Feynman's momentum arrow follows a single curve segment, so arcs and
    // custom placements use one explicit straight arrow, as on the canvas.
    const nativeMomentum =
      Boolean(e.momentum) && !arc && e.momentumAt === 0.5 && e.momentumDistance == null
    const extras = []
    if (inline)
      extras.push(
        command(
          'node',
          ['inner sep=2pt', ...color],
          '(edgeLabel' + i + ') at ' + point(g.label) + ' {$' + e.value + '$}',
        ),
      )
    if (e.momentum && !nativeMomentum) {
      const tail = add(g.momentum, scale(g.momentumDirection, -22)),
        head = add(g.momentum, scale(g.momentumDirection, 22))
      extras.push(
        command('draw', ['-Stealth', ...color], point(tail) + ' -- ' + point(head)),
        command(
          'node',
          ['inner sep=0pt', ...color],
          'at ' + point(g.momentumLabel) + ' {$' + e.momentum + '$}',
        ),
      )
    }
    const clips = (plan.cuts.get(e.id) || []).map(
      (cut) =>
        '\\clip ' +
        outer +
        ' ' +
        point(cut.point) +
        ' circle (' +
        centimetres(cut.radius) +
        'cm);',
    )
    if (inline)
      clips.push(
        '\\clip ' +
          outer +
          ' (edgeLabel' +
          i +
          '.south west) rectangle (edgeLabel' +
          i +
          '.north east);',
      )
    const labelOptions =
      e.value && !inline
        ? [
            'edge label' +
              (e.labelPosition === 'right' ? "'" : '') +
              '={$' +
              e.value +
              '$}',
            ...(e.labelAt !== 0.5
              ? ['/tikz/every node/.append style={pos=' + number(e.labelAt) + '}']
              : []),
          ]
        : []
    const momentumOptions = nativeMomentum
      ? [
          'momentum' +
            (e.momentumPosition === 'right' ? "'" : '') +
            '={$' +
            e.momentum +
            '$}',
        ]
      : []
    let path
    if (arc) {
      // Circles and ellipses are exact TikZ arcs from their first point.
      const start = from.position
      let centre, radii, startAngle, sweep, axis
      if (loop) {
        axis = e.loopAngle
        radii = [e.loopSize, e.loopSize * e.ellipseRatio]
        startAngle = axis + 180
        sweep = e.loopClockwise === false ? 360 : -360
      } else {
        const chord = sub(to.position, start)
        axis = vectorAngle(chord)
        radii = [length(chord) / 2, (length(chord) / 2) * e.ellipseRatio]
        startAngle = axis + 180
        sweep = e.bend < 0 ? 180 : -180
      }
      const circle = Math.abs(radii[0] - radii[1]) < 1e-9
      const options = [...style]
      if (!circle && Math.abs(normalizeAngle(axis)) > 1e-9)
        options.push(
          'rotate around={' + number(normalizeAngle(axis)) + ':' + point(start) + '}',
        )
      const shape = circle
        ? 'radius=' + centimetres(radii[0])
        : 'x radius=' + centimetres(radii[0]) + ', y radius=' + centimetres(radii[1])
      const label =
        e.value && !inline
          ? ' node [pos=' +
            number(e.labelAt) +
            ', ' +
            (e.labelPosition === 'right' ? 'auto=right' : 'auto') +
            (color.length ? ', ' + color.join(', ') : '') +
            '] {$' +
            e.value +
            '$}'
          : ''
      path = command(
        'draw',
        options,
        point(start) +
          ' arc [start angle=' +
          number(circle ? normalizeAngle(startAngle) : 180) +
          ', delta angle=' +
          sweep +
          ', ' +
          shape +
          ']' +
          label,
      )
    } else if (loop) {
      // TikZ-Feynman drops self-edges inside diagram*; explicit out/in/distance
      // reproduce the canvas, whereas TikZ's `loop` key would reset the
      // distance and add its default arrow tip.
      const controls = loopControls(e),
        at = point(from.position)
      path = command(
        'path',
        [],
        at +
          ' edge [' +
          [
            ...style,
            ...labelOptions,
            ...momentumOptions,
            'out=' + degrees(controls.out),
            'in=' + degrees(controls.in),
            'distance=' + centimetres(controls.distance) + 'cm',
          ].join(', ') +
          '] ' +
          at,
      )
    } else {
      const options = [...style]
      if (e.bend)
        options.push(
          'bend ' + (e.bend > 0 ? 'left' : 'right') + '=' + Math.abs(e.bend) / 2,
        )
      options.push(...labelOptions, ...momentumOptions)
      const ends = ['(' + names.get(e.from) + ')', '(' + names.get(e.to) + ')']
      if (!clips.length) {
        diagram.push('    ' + ends[0] + ' -- [' + options.join(', ') + '] ' + ends[1])
        named.push(...extras)
        return
      }
      path = command(
        'path',
        [],
        ends[0] + ' edge [' + options.join(', ') + '] ' + ends[1],
      )
    }
    const lines = clips.length
      ? [
          '  \\begin{scope}[even odd rule]',
          ...clips.map((clip) => '    ' + clip),
          '  ' + path,
          '  \\end{scope}',
        ]
      : [path]
    const group = arc || loop ? centred : named
    if (inline) group.push(extras.shift())
    group.push(...lines, ...extras)
  })
  const annotations = document.annotations.map((a) =>
    command('node', colorOption(a), 'at ' + point(a.position) + ' {$' + a.value + '$}'),
  )
  const definitions = [...colors].map(
    ([hex, name]) =>
      '\\definecolor{' + name + '}{HTML}{' + hex.slice(1).toUpperCase() + '}',
  )
  const body = [
    ...definitions,
    '\\begin{tikzpicture}',
    '\\begin{feynman}',
    ...centred,
    ...nodes,
    ...(diagram.length ? ['  \\diagram* {', diagram.join(',\n'), '  };'] : []),
    ...named,
    ...annotations,
    '\\end{feynman}',
    '\\end{tikzpicture}',
  ].join('\n')
  const header = shareURL ? '% ' + shareURL + '\n' : ''
  return standalone
    ? header +
        '\\documentclass[tikz,border=8pt]{standalone}\n\\usepackage{tikz-feynman}\n\\tikzfeynmanset{compat=1.1.0}\n\\begin{document}\n' +
        body +
        '\n\\end{document}\n'
    : header + body
}
