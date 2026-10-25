import {lineStyle, doubleArrow} from './catalog.mjs'
import {crossingPlan, bounds, add, scale, loopControls} from './geometry.mjs'
import {parseDiagram} from './model.mjs'
import {TEX_POINTS_PER_UNIT, vertexRadius, arrowPositions} from './styles.mjs'

const number = (value) => Number(value.toFixed(3))
const point = (p) => '(' + number(p[0] / 80) + ', ' + number(-p[1] / 80) + ')'
const vectorPath = (path) =>
  [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
    .map((m) => point([Number(m[1]), Number(m[2])]))
    .join(' -- ')
const widthOption = (e) =>
  e.width == null ? [] : ['line width=' + number(e.width * TEX_POINTS_PER_UNIT) + 'pt']

export function toTeX(document, {standalone = false, shareURL = ''} = {}) {
  document = parseDiagram(document)
  const names = new Map(document.nodes.map((n, i) => [n.id, 'v' + i])),
    colors = new Map()
  const colorOption = (item) => {
    if (item.color == null) return []
    if (!colors.has(item.color)) colors.set(item.color, 'diagramcolor' + colors.size)
    return ['color=' + colors.get(item.color)]
  }
  const command = (name, options, body) =>
    '  \\' +
    name +
    (options.length ? '[' + options.join(', ') + ']' : '') +
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
    if (n.value && n.vertex !== 'none') options.push('label={above:{$' + n.value + '$}}')
    // The explicit empty body preserves marked vertices in diagram*.
    const label = n.value && n.vertex === 'none' ? '{$' + n.value + '$}' : '{}'
    return command(
      'vertex',
      options,
      '(' + names.get(n.id) + ') at ' + point(n.position) + ' ' + label,
    )
  })
  const edgeType = (e) => {
    if (['fermion', 'antifermion'].includes(e.line))
      return e.arrow === 'none'
        ? 'plain'
        : e.arrow === 'backward'
          ? 'anti fermion'
          : 'fermion'
    if (e.line === 'charged-scalar')
      return e.arrow === 'none'
        ? 'scalar'
        : e.arrow === 'backward'
          ? 'anti charged scalar'
          : 'charged scalar'
    if (e.line === 'charged-boson')
      return e.arrow === 'none'
        ? 'photon'
        : e.arrow === 'backward'
          ? 'anti charged boson'
          : 'charged boson'
    return lineStyle(e.line).tex
  }
  const plan = crossingPlan(document)
  // Exact sampled paths keep clipping, attached vertices, circular loops and
  // inline labels aligned; other diagrams keep semantic TikZ-Feynman commands.
  const exact =
    plan.cuts.size > 0 ||
    document.nodes.some((n) => n.attachment) ||
    document.edges.some((e) => {
      const positions = arrowPositions(e.line, e.arrow)
      return (
        e.labelPosition === 'center' ||
        e.curve === 'ellipse' ||
        (e.momentum && (e.momentumAt !== 0.5 || e.momentumDistance != null)) ||
        (e.line === 'ghost' && e.width != null) ||
        (doubleArrow(e.arrow) && e.line !== 'majorana') ||
        (e.arrow !== 'none' &&
          (e.arrowAt !== positions[0] ||
            (doubleArrow(e.arrow) && e.arrowAt2 !== positions[1]))) ||
        (e.line === 'majorana' && e.arrow !== 'both')
      )
    })
  let renderedEdges
  // TikZ-Feynman never draws an edge from a vertex to itself inside diagram*,
  // so loops are separate edges from the vertex centre. Explicit out/in/distance
  // reproduce the canvas curve; TikZ's `loop` key would reset the distance and
  // add its default arrow tip.
  const loops = [],
    positions = new Map(document.nodes.map((n) => [n.id, n.position])),
    angle = (value) => number(((value % 360) + 360) % 360)
  if (!exact) {
    const edges = document.edges.flatMap((e) => {
      const options = [edgeType(e), ...widthOption(e), ...colorOption(e)]
      if (
        ![
          'fermion',
          'antifermion',
          'majorana',
          'charged-scalar',
          'charged-boson',
        ].includes(e.line) &&
        e.arrow !== 'none'
      )
        options.push(
          '/tikzfeynman/with ' +
            (e.arrow === 'backward' ? 'reversed ' : '') +
            'arrow=' +
            number(e.arrowAt),
        )
      if (e.bend && e.from !== e.to)
        options.push(
          'bend ' + (e.bend > 0 ? 'left' : 'right') + '=' + Math.abs(e.bend) / 2,
        )
      if (e.value) {
        options.push(
          'edge label' +
            (e.labelPosition === 'right' ? "'" : '') +
            '={$' +
            e.value +
            '$}',
        )
        if (e.labelAt !== 0.5)
          options.push('/tikz/every node/.append style={pos=' + number(e.labelAt) + '}')
      }
      if (e.momentum)
        options.push(
          'momentum' +
            (e.momentumPosition === 'right' ? "'" : '') +
            '={$' +
            e.momentum +
            '$}',
        )
      if (e.insertion) options.push('insertion=0.5')
      if (e.from === e.to) {
        const loop = loopControls(e),
          at = point(positions.get(e.from))
        options.push(
          'out=' + angle(loop.out),
          'in=' + angle(loop.in),
          'distance=' + number(loop.distance / 80) + 'cm',
        )
        loops.push(command('path', [], at + ' edge [' + options.join(', ') + '] ' + at))
        return []
      }
      return (
        '    (' +
        names.get(e.from) +
        ') -- [' +
        options.join(', ') +
        '] (' +
        names.get(e.to) +
        ')'
      )
    })
    renderedEdges = edges.length ? ['  \\diagram* {', edges.join(',\n'), '  };'] : []
  } else {
    const box = bounds(document, 200),
      outer =
        point([box.x, box.y + box.height]) +
        ' rectangle ' +
        point([box.x + box.width, box.y])
    renderedEdges = document.edges.flatMap((e, i) => {
      const g = plan.geometries.get(e.id)
      if (!g) return []
      const color = colorOption(e),
        inline = e.value && e.labelPosition === 'center',
        labelName = 'edgeLabel' + i,
        lines = []
      if (inline)
        lines.push(
          command(
            'node',
            ['inner sep=2pt', ...color],
            '(' + labelName + ') at ' + point(g.label) + ' {$' + e.value + '$}',
          ),
        )
      lines.push('  \\begin{scope}[even odd rule]')
      for (const cut of plan.cuts.get(e.id) || [])
        lines.push(
          '    \\clip ' +
            outer +
            ' ' +
            point(cut.point) +
            ' circle (' +
            number(cut.radius / 80) +
            'cm);',
        )
      if (inline)
        lines.push(
          '    \\clip ' +
            outer +
            ' (' +
            labelName +
            '.south west) rectangle (' +
            labelName +
            '.north east);',
        )
      const style = ['/tikzfeynman/every edge@@']
      if (e.line === 'ghost') style.push('thick', 'dotted')
      if (['scalar', 'charged-scalar'].includes(e.line)) style.push('dashed')
      style.push(...widthOption(e), ...color)
      for (const path of g.paths) lines.push(command('draw', style, vectorPath(path)))
      // Keep arrow size and insertion styling native, even on sampled curves.
      if (e.arrow !== 'none') {
        const marks = [[e.arrowAt, ['backward', 'backward-double'].includes(e.arrow)]]
        if (doubleArrow(e.arrow))
          marks.push([e.arrowAt2, ['both', 'backward-double'].includes(e.arrow)])
        for (const [at, reverse] of marks)
          lines.push(
            command(
              'path',
              [
                '/tikzfeynman/with ' +
                  (reverse ? 'reversed ' : '') +
                  'arrow=' +
                  number(at),
                ...color,
              ],
              vectorPath(g.hitPath),
            ),
          )
      }
      if (e.insertion)
        lines.push(
          command(
            'path',
            ['/tikzfeynman/insertion=0.5', ...widthOption(e), ...color],
            vectorPath(g.hitPath),
          ),
        )
      lines.push('  \\end{scope}')
      if (e.value && !inline)
        lines.push(
          command(
            'node',
            ['inner sep=0pt', ...color],
            'at ' + point(g.label) + ' {$' + e.value + '$}',
          ),
        )
      if (e.momentum) {
        const from = add(g.momentum, scale(g.momentumDirection, -22)),
          to = add(g.momentum, scale(g.momentumDirection, 22))
        lines.push(
          command('draw', ['-Stealth', ...color], point(from) + ' -- ' + point(to)),
        )
        lines.push(
          command(
            'node',
            ['inner sep=0pt', ...color],
            'at ' + point(g.momentumLabel) + ' {$' + e.momentum + '$}',
          ),
        )
      }
      return lines
    })
  }
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
    // Vertices follow loops so that marked vertices cover loop ends, as on screen.
    ...(exact ? [] : [...loops, ...nodes]),
    ...renderedEdges,
    ...(exact ? nodes : []),
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
