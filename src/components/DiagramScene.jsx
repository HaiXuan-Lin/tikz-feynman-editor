import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useId, useState, useMemo} from 'preact/hooks'
import {selected} from '../core/model.mjs'
import {
  edgeGeometry,
  add,
  scale,
  normal,
  momentumArrow,
  crossingPlan,
} from '../core/geometry.mjs'
import MathLabel from './MathLabel'
import {
  ink,
  vertexRadius,
  lineWidth,
  lineDash,
  DEFAULT_STROKE,
  TEX_POINTS_PER_UNIT,
} from '../core/styles.mjs'

export function EdgeShape({
  from,
  to,
  edge,
  isSelected = false,
  preview = false,
  cuts = [],
}) {
  const t = useI18n()

  const maskId = `edge-mask-${useId()}`
  const [labelSize, setLabelSize] = useState({width: 40, height: 18})
  const geometry = edgeGeometry(from, to, edge)
  const color = ink(edge.color),
    width = lineWidth(edge)
  const inline = !preview && edge.value && edge.labelPosition === 'center'
  const masked = cuts.length > 0 || inline
  const xs = geometry.samples.map((s) => s.point[0]),
    ys = geometry.samples.map((s) => s.point[1])
  const padding = Math.max(60, labelSize.width / 2 + 10),
    maskBox = {
      x: Math.min(...xs) - padding,
      y: Math.min(...ys) - padding,
      width: Math.max(...xs) - Math.min(...xs) + padding * 2,
      height: Math.max(...ys) - Math.min(...ys) + padding * 2,
    }
  const dash = lineDash(edge)?.join(' ')
  const momentumFrom = add(geometry.momentum, scale(geometry.momentumDirection, -22))
  const momentumTo = add(geometry.momentum, scale(geometry.momentumDirection, 22))
  const momentumHead = momentumArrow({
    point: momentumTo,
    tangent: geometry.momentumDirection,
  })
  const insertionNormal = normal(geometry.insertion.tangent)
  return (
    <g
      class="diagram-edge"
      data-kind="edge"
      data-id={edge.id}
      role={preview ? undefined : 'button'}
      aria-label={preview ? undefined : t('传播子 {0} {1}', edge.line, edge.value)}
      tabindex={preview ? undefined : -1}
    >
      {!preview && (
        <path
          class="hit-target"
          d={geometry.hitPath}
          stroke="transparent"
          stroke-width="18"
          fill="none"
        />
      )}
      {masked && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            {...maskBox}
          >
            <rect {...maskBox} fill="white" />
            {cuts.map((c) => (
              <circle cx={c.point[0]} cy={c.point[1]} r={c.radius} fill="black" />
            ))}
            {inline && (
              <rect
                x={geometry.label[0] - labelSize.width / 2 - 4}
                y={geometry.label[1] - labelSize.height / 2 - 3}
                width={labelSize.width + 8}
                height={labelSize.height + 6}
                rx="1"
                fill="black"
              />
            )}
          </mask>
        </defs>
      )}
      <g class="propagator-ink" mask={masked ? `url(#${maskId})` : undefined}>
        {isSelected && (
          <path
            class="selection-halo"
            d={geometry.hitPath}
            stroke="#819cd0"
            stroke-width="9"
            opacity=".22"
            fill="none"
          />
        )}
        {geometry.paths.map((path) => (
          <path
            d={path}
            fill="none"
            stroke={color}
            stroke-width={width}
            stroke-dasharray={dash}
            stroke-linecap="butt"
            pointer-events="none"
          />
        ))}
        {geometry.arrows.map((points) => (
          <polygon points={points} fill={color} pointer-events="none" />
        ))}
        {edge.insertion && (
          <path
            d={[
              [-1, -1],
              [1, 1],
              [-1, 1],
              [1, -1],
            ]
              .map(
                ([a, b], i) =>
                  `${i % 2 ? 'L' : 'M'}${add(geometry.insertion.point, add(scale(insertionNormal, a * (3 / TEX_POINTS_PER_UNIT)), scale(geometry.insertion.tangent, b * (3 / TEX_POINTS_PER_UNIT)))).join(',')}`,
              )
              .join(' ')}
            stroke={color}
            stroke-width={edge.width ?? DEFAULT_STROKE}
            pointer-events="none"
          />
        )}
      </g>
      {!preview && edge.value && (
        <MathLabel
          value={edge.value}
          x={geometry.label[0]}
          y={geometry.label[1]}
          color={color}
          size={17}
          onMeasure={setLabelSize}
        />
      )}
      {!preview && edge.momentum && (
        <g class="momentum-mark" data-side={edge.momentumPosition} pointer-events="none">
          <path
            d={`M${momentumFrom.join(',')}L${momentumHead.lineEnd.join(',')}`}
            stroke={color}
            stroke-width={DEFAULT_STROKE}
          />
          <polygon
            points={momentumHead.points}
            fill={color}
            stroke={color}
            stroke-width={DEFAULT_STROKE}
            stroke-linejoin="miter"
          />
          <MathLabel
            value={edge.momentum}
            x={geometry.momentumLabel[0]}
            y={geometry.momentumLabel[1]}
            color={color}
            size={15}
          />
        </g>
      )}
    </g>
  )
}

export function VertexShape({vertex, color, size = null}) {
  const patternId = 'vertex-pattern-' + useId()
  color = ink(color)
  if (vertex === 'none') return null
  const radius = vertexRadius({vertex, size})
  const stroke = {stroke: color, 'stroke-width': DEFAULT_STROKE}
  if (vertex === 'square_dot')
    return (
      <rect
        x={-radius}
        y={-radius}
        width={2 * radius}
        height={2 * radius}
        fill={color}
        {...stroke}
      />
    )
  if (vertex === 'crossed_dot') {
    const d = radius / Math.SQRT2
    return (
      <g {...stroke}>
        <circle r={radius} fill="none" />
        <path d={'M' + [-d, -d] + 'L' + [d, d] + 'M' + [-d, d] + 'L' + [d, -d]} />
      </g>
    )
  }
  return (
    <>
      {vertex === 'blob' && (
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="8.435"
            height="8.435"
            patternTransform="rotate(-45)"
          >
            <path d="M0,0L0,8.435" {...stroke} />
          </pattern>
        </defs>
      )}
      <circle
        r={radius}
        fill={
          vertex === 'blob'
            ? 'url(#' + patternId + ')'
            : vertex === 'empty_dot'
              ? 'none'
              : color
        }
        {...stroke}
      />
    </>
  )
}

export default function DiagramScene({
  document,
  selection = [],
  preview = false,
  sceneRef,
}) {
  const t = useI18n()

  const nodes = new Map(document.nodes.map((n) => [n.id, n]))
  const plan = useMemo(
    () => (preview ? {cuts: new Map()} : crossingPlan(document)),
    [document, preview],
  )
  return (
    <g ref={sceneRef} class="diagram-scene">
      {document.edges.map(
        (e) =>
          nodes.has(e.from) &&
          nodes.has(e.to) && (
            <EdgeShape
              key={e.id}
              from={nodes.get(e.from)}
              to={nodes.get(e.to)}
              edge={e}
              isSelected={selected(selection, 'edge', e.id)}
              preview={preview}
              cuts={plan.cuts.get(e.id) || []}
            />
          ),
      )}
      {document.nodes.map((n) => (
        <g
          key={n.id}
          transform={`translate(${n.position.join(' ')})`}
          data-kind="node"
          data-id={n.id}
          role={preview ? undefined : 'button'}
          aria-label={preview ? undefined : t('顶点 {0}', n.value || n.vertex)}
          tabindex={preview ? undefined : -1}
        >
          {!preview && <circle class="hit-target" r="19" fill="transparent" />}
          {selected(selection, 'node', n.id) && (
            <circle
              class="selection-halo"
              r={Math.max(15, vertexRadius(n) + 6)}
              fill="#819cd0"
              opacity=".18"
              stroke="#5674bd"
            />
          )}
          {!preview && n.vertex === 'none' && !n.value && (
            <circle class="node-handle" r="3" fill="#b8bec9" />
          )}
          <VertexShape vertex={n.vertex} color={ink(n.color)} size={n.size} />
          {!preview && (
            <MathLabel
              value={n.value}
              y={n.vertex === 'none' ? 0 : -(vertexRadius(n) + 20)}
              color={ink(n.color)}
            />
          )}
        </g>
      ))}
      {!preview &&
        document.annotations.map((a) => (
          <g
            key={a.id}
            transform={`translate(${a.position.join(' ')})`}
            data-kind="text"
            data-id={a.id}
            role="button"
            aria-label={t('标注 {0}', a.value)}
            tabindex="-1"
          >
            <rect
              class="hit-target"
              x="-70"
              y="-18"
              width="140"
              height="36"
              fill="transparent"
            />
            {selected(selection, 'text', a.id) && (
              <rect
                class="selection-halo"
                x="-72"
                y="-20"
                width="144"
                height="40"
                rx="4"
                fill="#819cd0"
                opacity=".15"
              />
            )}
            <MathLabel value={a.value} size={a.size} color={ink(a.color)} />
          </g>
        ))}
    </g>
  )
}
