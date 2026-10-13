import {lineStyle, doubleArrow} from './catalog.mjs'
import {crossingPlan, bounds, add, scale, normal, arrowPolygon} from './geometry.mjs'
import {resolveAttachments} from './model.mjs'

const number = (value) => Number(value.toFixed(3))
const texColor = (color, prefix, map) => {
  if (color === '#282a30') return ''
  if (!map.has(color)) map.set(color, `${prefix}${map.size}`)
  return map.get(color)
}

export function toTeX(document, {standalone = false, shareURL = ''} = {}) {
  document = resolveAttachments(document)
  const names = new Map(document.nodes.map((n, i) => [n.id, `v${i}`]))
  const colors = new Map()
  const nodes = document.nodes.map((n) => {
    const options = []
    if (n.vertex !== 'none') options.push(n.vertex.replace(/_/g, ' '))
    const color = texColor(n.color, 'diagramcolor', colors)
    if (color)
      options.push(
        `draw=${color}`,
        `text=${color}`,
        `fill=${n.vertex === 'empty_dot' || n.vertex === 'blob' ? 'white' : color}`,
      )
    if (n.vertex !== 'none')
      options.push(`minimum size=${number((n.vertex === 'blob' ? 2.7 : 2) * n.size)}pt`)
    if (n.vertex === 'blob') options.push('pattern=none')
    if (n.value && n.vertex !== 'none') options.push(`label={above:{$${n.value}$}}`)
    // An explicit body prevents TikZ-Feynman from resetting marked vertices
    // to invisible coordinates when the vertex command has no text.
    const label = n.value && n.vertex === 'none' ? ` {$${n.value}$}` : ' {}'
    return `  \\vertex${options.length ? `[${options.join(', ')}]` : ''} (${names.get(n.id)}) at (${number(n.position[0] / 80)}, ${number(-n.position[1] / 80)})${label};`
  })
  const edges = document.edges.map((e) => {
    let type = lineStyle(e.line).tex
    if (e.line === 'fermion' || e.line === 'antifermion')
      type =
        e.arrow === 'none' ? 'plain' : e.arrow === 'backward' ? 'anti fermion' : 'fermion'
    if (e.line === 'charged-scalar')
      type =
        e.arrow === 'backward'
          ? 'anti charged scalar'
          : e.arrow === 'none'
            ? 'scalar'
            : 'charged scalar'
    if (e.line === 'charged-boson')
      type =
        e.arrow === 'backward'
          ? 'anti charged boson'
          : e.arrow === 'none'
            ? 'photon'
            : 'charged boson'
    if (['fermion', 'antifermion'].includes(e.line) && e.arrow === 'both')
      type = 'majorana'
    const options = [type, `line width=${number(e.width * 0.6)}pt`]
    if (
      !['fermion', 'antifermion', 'majorana', 'charged-scalar', 'charged-boson'].includes(
        e.line,
      ) &&
      e.arrow !== 'none'
    ) {
      if (e.arrow === 'forward' || e.arrow === 'both')
        options.push(`with arrow=${e.arrow === 'both' ? '.35' : '.5'}`)
      if (e.arrow === 'backward' || e.arrow === 'both')
        options.push(`with reversed arrow=${e.arrow === 'both' ? '.65' : '.5'}`)
    }
    if (['charged-scalar', 'charged-boson'].includes(e.line) && e.arrow === 'both')
      options.push('with reversed arrow=.65')
    const color = texColor(e.color, 'diagramcolor', colors)
    if (color) options.push(`draw=${color}`, `text=${color}`)
    if (e.from === e.to) {
      const angles = {
        top: [55, 125],
        right: [-35, 35],
        bottom: [235, 305],
        left: [145, 215],
      }[e.loopDirection]
      options.push(
        `out=${angles[0]}`,
        `in=${angles[1]}`,
        'loop',
        `min distance=${number((e.loopSize / 80) * 2)}cm`,
      )
    } else if (e.bend)
      options.push(`bend ${e.bend > 0 ? 'left' : 'right'}=${Math.abs(e.bend) / 2}`)
    if (e.value)
      options.push(
        `edge label${e.labelPosition === 'right' ? "'" : ''}={$${e.value}$}`,
        `/tikz/every node/.append style={pos=${number(e.labelAt)}}`,
      )
    if (e.momentum)
      options.push(
        `momentum${e.momentumPosition === 'right' ? "'" : ''}={$${e.momentum}$}`,
      )
    if (e.insertion) options.push('insertion=0.5')
    return `    (${names.get(e.from)}) -- [${options.join(', ')}] (${names.get(e.to)})`
  })
  const annotations = document.annotations.map((a) => {
    const color = texColor(a.color, 'diagramcolor', colors)
    return `  \\node${color ? `[text=${color}]` : ''} at (${number(a.position[0] / 80)}, ${number(-a.position[1] / 80)}) {$${a.value}$};`
  })
  const plan = crossingPlan(document)
  // Exact sampled paths keep clipping, attached vertices and inline labels aligned.
  // Simple diagrams retain compact, semantic TikZ-Feynman propagator commands.
  const exact =
    plan.cuts.size > 0 ||
    document.nodes.some((n) => n.attachment) ||
    document.edges.some(
      (e) =>
        e.labelPosition === 'center' ||
        e.momentumAt !== 0.5 ||
        e.momentumDistance !== 32 ||
        e.curve === 'ellipse' ||
        ['forward-double', 'backward-double'].includes(e.arrow) ||
        (e.arrow !== 'none' &&
          ((e.arrowAt ?? (doubleArrow(e.arrow) ? 0.35 : 0.5)) !==
            (doubleArrow(e.arrow) ? 0.35 : 0.5) ||
            (doubleArrow(e.arrow) && (e.arrowAt2 ?? 0.65) !== 0.65))) ||
        (e.line === 'majorana' && e.arrow !== 'both'),
    )
  const point = (p) => `(${number(p[0] / 80)}, ${number(-p[1] / 80)})`
  const box = bounds(document, 200)
  const outer = `${point([box.x, box.y + box.height])} rectangle ${point([box.x + box.width, box.y])}`
  const vectorPath = (path) =>
    [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
      .map((m) => point([Number(m[1]), Number(m[2])]))
      .join(' -- ')
  const renderedEdges = exact
    ? document.edges.flatMap((e, i) => {
        const geometry = plan.geometries.get(e.id),
          color = texColor(e.color, 'diagramcolor', colors) || 'black',
          lines = []
        if (!geometry) return lines
        const inline = e.value && e.labelPosition === 'center',
          labelName = `edgeLabel${i}`
        if (inline)
          lines.push(
            `  \\node[inner sep=2pt, text=${color}] (${labelName}) at ${point(geometry.label)} {$${e.value}$};`,
          )
        lines.push('  \\begin{scope}[even odd rule]')
        for (const cut of plan.cuts.get(e.id) || [])
          lines.push(
            `    \\clip ${outer} ${point(cut.point)} circle (${number(cut.radius / 80)}cm);`,
          )
        if (inline)
          lines.push(
            `    \\clip ${outer} (${labelName}.south west) rectangle (${labelName}.north east);`,
          )
        const style = [
          `draw=${color}`,
          `line width=${number(e.width * 0.6)}pt`,
          'line cap=round',
          'line join=round',
        ]
        if (['scalar', 'charged-scalar'].includes(e.line))
          style.push('dash pattern=on 4.2pt off 3pt')
        if (e.line === 'ghost') style.push('dash pattern=on .6pt off 3pt')
        for (const path of geometry.paths)
          lines.push(`    \\draw[${style.join(', ')}] ${vectorPath(path)};`)
        for (const arrow of geometry.arrows)
          lines.push(`    \\fill[${color}] ${vectorPath(arrow)} -- cycle;`)
        if (e.insertion) {
          const p = geometry.insertion.point,
            t = geometry.insertion.tangent,
            n = normal(t)
          for (const sign of [-1, 1])
            lines.push(
              `    \\draw[${color},line width=1pt] ${point(add(p, add(scale(t, -5), scale(n, -5 * sign))))} -- ${point(add(p, add(scale(t, 5), scale(n, 5 * sign))))};`,
            )
        }
        lines.push('  \\end{scope}')
        if (e.value && !inline)
          lines.push(
            `  \\node[text=${color},inner sep=0pt] at ${point(geometry.label)} {$${e.value}$};`,
          )
        if (e.momentum) {
          const from = add(geometry.momentum, scale(geometry.momentumDirection, -22)),
            to = add(geometry.momentum, scale(geometry.momentumDirection, 22))
          lines.push(
            `  \\draw[${color},line width=.6pt] ${point(from)} -- ${point(to)};`,
            `  \\fill[${color}] ${vectorPath(arrowPolygon({point: to, tangent: geometry.momentumDirection}, false, 4))} -- cycle;`,
            `  \\node[text=${color},inner sep=0pt] at ${point(geometry.momentumLabel)} {$${e.momentum}$};`,
          )
        }
        return lines
      })
    : ['  \\diagram* {', edges.join(',\n'), '  };']
  const definitions = [...colors].map(
    ([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`,
  )
  const body = [
    ...definitions,
    '\\begin{tikzpicture}',
    '\\begin{feynman}',
    ...(exact ? [] : nodes),
    ...renderedEdges,
    ...(exact ? nodes : []),
    ...annotations,
    '\\end{feynman}',
    '\\end{tikzpicture}',
  ].join('\n')
  const header = shareURL ? `% ${shareURL}\n` : ''
  return standalone
    ? `${header}\\documentclass[tikz,border=8pt]{standalone}\n\\usepackage{tikz-feynman}\n\\tikzfeynmanset{compat=1.1.0}\n\\begin{document}\n${body}\n\\end{document}\n`
    : header + body
}
