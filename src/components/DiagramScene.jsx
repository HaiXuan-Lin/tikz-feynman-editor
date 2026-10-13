import {useI18n} from './I18n'
import {h} from 'preact'
import {useId, useState, useMemo} from 'preact/hooks'
import {selected} from '../core/model.mjs'
import {
  edgeGeometry,
  add,
  scale,
  normal,
  arrowPolygon,
  crossingPlan,
} from '../core/geometry.mjs'
import MathLabel from './MathLabel'

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
  const dash = ['scalar', 'charged-scalar'].includes(edge.line)
    ? '7 5'
    : edge.line === 'ghost'
      ? '1 5'
      : undefined
  const momentumFrom = add(geometry.momentum, scale(geometry.momentumDirection, -22))
  const momentumTo = add(geometry.momentum, scale(geometry.momentumDirection, 22))
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
            stroke={edge.color}
            stroke-width={edge.width}
            stroke-dasharray={dash}
            stroke-linecap="round"
            pointer-events="none"
          />
        ))}
        {geometry.arrows.map((points) => (
          <polygon points={points} fill={edge.color} pointer-events="none" />
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
                  `${i % 2 ? 'L' : 'M'}${add(geometry.insertion.point, add(scale(insertionNormal, a * 5), scale(geometry.insertion.tangent, b * 5))).join(',')}`,
              )
              .join(' ')}
            stroke={edge.color}
            stroke-width={edge.width + 0.5}
            pointer-events="none"
          />
        )}
      </g>
      {!preview && edge.value && (
        <MathLabel
          value={edge.value}
          x={geometry.label[0]}
          y={geometry.label[1]}
          color={edge.color}
          size={17}
          onMeasure={setLabelSize}
        />
      )}
      {!preview && edge.momentum && (
        <g class="momentum-mark" data-side={edge.momentumPosition} pointer-events="none">
          <path
            d={`M${momentumFrom.join(',')}L${momentumTo.join(',')}`}
            stroke={edge.color}
            stroke-width="1"
          />
          <polygon
            points={arrowPolygon(
              {point: momentumTo, tangent: geometry.momentumDirection},
              false,
              4,
            )}
            fill={edge.color}
          />
          <MathLabel
            value={edge.momentum}
            x={geometry.momentumLabel[0]}
            y={geometry.momentumLabel[1]}
            color={edge.color}
            size={15}
          />
        </g>
      )}
    </g>
  )
}

export function VertexShape({vertex, color, size = 5}) {
  if (vertex === 'none') return null
  if (vertex === 'square_dot')
    return <rect x={-size} y={-size} width={size * 2} height={size * 2} fill={color} />
  if (vertex === 'crossed_dot')
    return (
      <g stroke={color} stroke-width="1.8">
        <circle r={size + 2} fill="white" />
        <path
          d={`M${-size},${-size}L${size},${size}M${-size},${size}L${size},${-size}`}
        />
      </g>
    )
  return (
    <circle
      r={vertex === 'blob' ? size * 2.7 : size}
      fill={['empty_dot', 'blob'].includes(vertex) ? 'white' : color}
      stroke={color}
      stroke-width={vertex === 'blob' ? 1.8 : 1.5}
    />
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
              r={n.vertex === 'blob' ? n.size * 2.7 + 6 : 15}
              fill="#819cd0"
              opacity=".18"
              stroke="#5674bd"
            />
          )}
          {!preview && n.vertex === 'none' && !n.value && (
            <circle class="node-handle" r="3" fill="#b8bec9" />
          )}
          <VertexShape vertex={n.vertex} color={n.color} size={n.size} />
          {!preview && (
            <MathLabel
              value={n.value}
              y={n.vertex === 'none' ? 0 : -(n.vertex === 'blob' ? 34 : 24)}
              color={n.color}
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
            <MathLabel value={a.value} size={a.size} color={a.color} />
          </g>
        ))}
    </g>
  )
}
