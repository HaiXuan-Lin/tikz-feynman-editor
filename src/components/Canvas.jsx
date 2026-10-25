import {useI18n} from './I18n'
import {h} from 'preact'
import {useEffect, useMemo, useRef, useState} from 'preact/hooks'
import DiagramScene, {EdgeShape, vertexZones} from './DiagramScene'
import {GRID} from '../core/catalog.mjs'
import {
  add,
  angleVector,
  bounds,
  edgeCurve,
  length,
  nearestEdge,
  normalizeAngle,
  scale,
  snapToGeometry,
  sub,
  vectorAngle,
} from '../core/geometry.mjs'
import {
  clone,
  edge as makeEdge,
  key,
  selected,
  snap,
  attachmentExclusions,
} from '../core/model.mjs'

// Screen distances: a click may wobble a little, and a drag must leave the
// vertex this far before returning to it creates a self-loop.
const CLICK = 4,
  LOOP_ARM = 42,
  // The loop handle floats this far beyond the apex, clear of its arrow.
  HANDLE_GAP = 16

const ghost = (id, position) => ({id, position, vertex: 'none', size: 0})

export default function Canvas({
  document: diagram,
  selection,
  onSelection,
  tool,
  line,
  panHeld,
  snapEnabled,
  snapToEdges,
  snapAxes,
  showGrid,
  insets,
  onPreview,
  onCommit,
  onNode,
  onText,
  onConnect,
  onEditLabel,
  fitToken,
  zoomAction,
  cancelToken,
  sceneRef,
  onZoom,
}) {
  const t = useI18n()

  const host = useRef(),
    gesture = useRef(),
    connectionTrace = useRef(null)
  const [size, setSize] = useState([900, 700])
  const [view, setView] = useState({x: 0, y: 0, zoom: 1})
  const [draft, setDraft] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const [connection, setConnection] = useState(null)
  const [snapGuide, setSnapGuide] = useState(null)
  const [axisGuide, setAxisGuide] = useState(null)
  const [hover, setHover] = useState(null)
  const [loopDrag, setLoopDrag] = useState(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize([entry.contentRect.width, entry.contentRect.height]),
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Fit into the area left uncovered by the floating panels.
    const box = bounds(diagram, 60)
    const area = [
      Math.max(160, size[0] - insets.left - insets.right),
      Math.max(160, size[1] - insets.top - insets.bottom),
    ]
    const zoom = Math.max(0.2, Math.min(1.25, area[0] / box.width, area[1] / box.height))
    setView({
      x: insets.left + area[0] / 2 - size[0] / 2 - (box.x + box.width / 2) * zoom,
      y: insets.top + area[1] / 2 - size[1] / 2 - (box.y + box.height / 2) * zoom,
      zoom,
    })
  }, [fitToken, size])
  useEffect(() => {
    onZoom(view.zoom)
  }, [view.zoom])
  useEffect(() => {
    if (zoomAction)
      setView((v) => ({
        ...v,
        x: v.x * zoomAction.factor,
        y: v.y * zoomAction.factor,
        zoom: Math.max(0.2, Math.min(3, v.zoom * zoomAction.factor)),
      }))
  }, [zoomAction])
  const reset = () => {
    gesture.current = null
    connectionTrace.current = null
    setDraft(null)
    setConnection(null)
    setMarquee(null)
    setSnapGuide(null)
    setAxisGuide(null)
    setLoopDrag(null)
  }
  useEffect(() => {
    if (gesture.current?.original) onPreview(gesture.current.original)
    reset()
    setHover(null)
  }, [cancelToken, tool])

  const coordinates = (event) => {
    const rect = host.current.getBoundingClientRect()
    return [
      (event.clientX - rect.left - size[0] / 2 - view.x) / view.zoom,
      (event.clientY - rect.top - size[1] / 2 - view.y) / view.zoom,
    ]
  }
  const nodeHit = (point) => {
    let best = null
    for (const n of diagram.nodes) {
      const distance = length(sub(n.position, point)),
        zones = vertexZones(n, view.zoom)
      if (distance <= zones.hit && (!best || distance < best.distance))
        best = {node: n, distance, zone: distance <= zones.core ? 'core' : 'ring'}
    }
    return best
  }
  const nodeAt = (point) => nodeHit(point)?.node
  const placement = (
    point,
    {anchors = [], exclude = new Set(), forceAxis = false, source = diagram} = {},
  ) => {
    const placed = snapToGeometry(source, point, {
      anchors,
      exclude,
      forceAxis,
      axes: snapAxes,
      toEdges: snapToEdges,
      tolerance: 14 / view.zoom,
    })
    if (!placed.attachment) {
      const position = snap(placed.point, snapEnabled)
      if (placed.axis) {
        const component = placed.axis === 'vertical' ? 0 : 1
        position[component] = placed.anchor[component]
      }
      return {...placed, point: position}
    }
    return placed
  }
  const endpointPlacement = (point, start, event) => {
    const existing = nodeAt(point)
    if (existing) {
      const axis =
        Math.abs(existing.position[0] - start[0]) < 1e-8
          ? 'vertical'
          : Math.abs(existing.position[1] - start[1]) < 1e-8
            ? 'horizontal'
            : null
      return {
        point: existing.position,
        node: existing,
        attachment: existing.attachment,
        axis,
        anchor: start,
      }
    }
    return placement(point, {anchors: [start], forceAxis: event.shiftKey})
  }
  const guide = (placed) => {
    setSnapGuide(placed?.attachment ? placed.point : null)
    setAxisGuide(
      placed?.axis ? {start: placed.anchor, end: placed.point, axis: placed.axis} : null,
    )
  }

  // A drawing stroke remembers its farthest point and swept area, so a stroke
  // that returns to its vertex becomes a loop pointing where the user went,
  // turning the way the user circled.
  const trace = (g, position) => {
    const offset = sub(position, g.start),
      distance = length(offset)
    if (distance > g.reach) {
      g.reach = distance
      g.apex = offset
    }
    if (g.last) g.area += g.last[0] * offset[1] - offset[0] * g.last[1]
    g.last = offset
  }
  const loopTarget = (g, position, event) => {
    if (!g || g.reach * view.zoom < LOOP_ARM) return null
    const home = g.startID
      ? nodeAt(position)?.id === g.startID
      : length(sub(position, g.start)) * view.zoom < 22
    if (!home) return null
    const raw = vectorAngle(g.apex)
    // Screen y points down, so a positive shoelace sum is a clockwise stroke.
    const swept = Math.abs(g.area) / 2 > 0.08 * g.reach * g.reach
    return {
      angle: normalizeAngle(
        Math.round(raw / (event.shiftKey ? 15 : 1)) * (event.shiftKey ? 15 : 1),
      ),
      clockwise: swept ? g.area > 0 : true,
      size: Math.round(Math.max(25, Math.min(200, g.reach / 2))),
    }
  }
  const beginDraw = (start, startNode, startAttachment, screen, options = {}) => {
    const previous = options.trace
    gesture.current = {
      type: 'edge',
      start,
      startID: startNode?.id,
      startAttachment,
      screen,
      hadConnection: Boolean(options.hadConnection),
      fromSelect: Boolean(options.fromSelect),
      reach: previous?.reach || 0,
      apex: previous?.apex || [0, 0],
      area: previous?.area || 0,
      last: previous?.last || null,
    }
    setDraft({start, end: start})
  }
  const drawTo = (g, position, event) => {
    const loop = loopTarget(g, position, event)
    if (loop) {
      guide(null)
      setDraft({start: g.start, loop, source: g.startID})
    } else {
      const placed = endpointPlacement(position, g.start, event)
      guide(placed)
      setDraft({
        start: g.start,
        end: placed.point,
        source: g.startID,
        target: placed.node?.id,
      })
    }
  }
  const updateHover = (position, event) => {
    if (tool === 'pan' || panHeld || tool === 'text') return setHover(null)
    const hit = nodeHit(position)
    if (hit) {
      setHover({id: hit.node.id, zone: tool === 'select' ? hit.zone : 'core'})
      guide(null)
      return
    }
    if (tool === 'select' && event.target.closest('[data-kind]')) {
      setHover(null)
      guide(null)
      return
    }
    const placed = placement(position)
    guide(placed)
    setHover(placed.attachment ? null : {point: placed.point})
  }

  const pointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return
    const position = coordinates(event),
      target = event.target.closest('[data-kind]')
    host.current.setPointerCapture(event.pointerId)
    const screen = [event.clientX, event.clientY]
    setHover(null)
    if (tool === 'pan' || panHeld || event.button === 1) {
      gesture.current = {type: 'pan', screen, view}
      return
    }
    if (target?.dataset.kind === 'loop-handle') {
      gesture.current = {
        type: 'loop',
        id: target.dataset.id,
        screen,
        original: clone(diagram),
      }
      return
    }
    // A selected vertex's label can be dragged, except over the vertex centre,
    // which still starts a propagator.
    if (
      tool === 'select' &&
      target?.dataset.kind === 'vertex-label' &&
      nodeHit(position)?.zone !== 'core'
    ) {
      gesture.current = {
        type: 'label',
        id: target.dataset.id,
        start: position,
        screen,
        original: clone(diagram),
      }
      return
    }
    if (tool === 'node') {
      const placed = placement(position)
      onNode(placed.point, nodeAt(position)?.id || null, placed.attachment)
      return
    }
    if (tool === 'text') {
      onText(snap(position, snapEnabled))
      return
    }
    if (tool === 'edge') {
      const startNode = connection || nodeAt(position)
      const placed = startNode ? null : placement(position)
      beginDraw(
        startNode ? startNode.position : placed.point,
        startNode,
        startNode ? startNode.attachment : placed.attachment,
        screen,
        {hadConnection: Boolean(connection), trace: connectionTrace.current},
      )
      return
    }
    // The selection tool follows quiver: drag from a vertex centre, a
    // propagator or empty space to draw, and from around a vertex to move it.
    const kind = target?.dataset.kind,
      hit = nodeHit(position)
    const only = (itemKey) => selection.length === 1 && selection[0] === itemKey
    if (!event.shiftKey && hit?.zone === 'core') {
      gesture.current = {
        type: 'press',
        node: hit.node,
        screen,
        position,
        wasSelected: only(key('node', hit.node.id)),
      }
      return
    }
    if (!event.shiftKey && !hit && kind === 'edge') {
      gesture.current = {
        type: 'press',
        edgeID: target.dataset.id,
        screen,
        position,
        wasSelected: only(key('edge', target.dataset.id)),
      }
      return
    }
    if (hit || kind) {
      const itemKey = hit ? key('node', hit.node.id) : key(kind, target.dataset.id)
      const wasSelected = only(itemKey)
      const next = event.shiftKey
        ? selection.includes(itemKey)
          ? selection.filter((k) => k !== itemKey)
          : [...selection, itemKey]
        : selection.includes(itemKey)
          ? selection
          : [itemKey]
      onSelection(next)
      gesture.current =
        itemKey.startsWith('edge:') || !next.includes(itemKey)
          ? {type: 'click', screen}
          : {
              type: 'move',
              start: position,
              screen,
              original: clone(diagram),
              selection: next,
              focus: wasSelected && !event.shiftKey,
            }
      return
    }
    if (event.shiftKey) {
      gesture.current = {type: 'marquee', start: position, screen, selection}
      setMarquee({start: position, end: position})
      return
    }
    gesture.current = {type: 'press', screen, position}
    onSelection([])
  }
  const pointerMove = (event) => {
    let g = gesture.current
    const position = coordinates(event)
    if (!g) {
      if (connection) {
        trace(connectionTrace.current, position)
        drawTo({...connectionTrace.current, startID: connection.id}, position, event)
      } else updateHover(position, event)
      return
    }
    if (g.type === 'press') {
      if (Math.hypot(event.clientX - g.screen[0], event.clientY - g.screen[1]) <= CLICK)
        return
      const parent = g.edgeID && diagram.edges.find((e) => e.id === g.edgeID)
      const start = g.node
        ? {point: g.node.position, attachment: g.node.attachment}
        : (parent &&
            nearestEdge({...diagram, edges: [parent]}, g.position, 40 / view.zoom)) ||
          placement(g.position)
      beginDraw(start.point, g.node, start.attachment, g.screen, {fromSelect: true})
      g = gesture.current
    }
    if (g.type === 'pan') {
      setView({
        ...g.view,
        x: g.view.x + event.clientX - g.screen[0],
        y: g.view.y + event.clientY - g.screen[1],
      })
    } else if (g.type === 'edge') {
      trace(g, position)
      drawTo(g, position, event)
    } else if (g.type === 'loop') {
      const loop = g.original.edges.find((e) => e.id === g.id),
        vertex = loop && g.original.nodes.find((n) => n.id === loop.from)
      if (!vertex) return
      const offset = sub(position, vertex.position)
      let angle = Math.round(vectorAngle(offset))
      if (event.shiftKey) angle = Math.round(angle / 15) * 15
      const changes = {
        loopAngle: normalizeAngle(angle),
        loopSize: Math.round(
          Math.max(25, Math.min(200, (length(offset) - HANDLE_GAP / view.zoom) / 2)),
        ),
      }
      setLoopDrag({vertex: vertex.position, ...changes})
      onPreview({
        ...g.original,
        edges: g.original.edges.map((e) => (e.id === g.id ? {...e, ...changes} : e)),
      })
    } else if (g.type === 'label') {
      const vertex = g.original.nodes.find((n) => n.id === g.id)
      if (!vertex) return
      let delta = sub(position, g.start)
      // Shift keeps the label on its dominant axis.
      if (event.shiftKey)
        delta = Math.abs(delta[0]) > Math.abs(delta[1]) ? [delta[0], 0] : [0, delta[1]]
      const offset = (vertex.labelOffset || [0, 0]).map(
        (x, i) => Math.round(Math.max(-400, Math.min(400, x + delta[i])) * 2) / 2,
      )
      onPreview({
        ...g.original,
        nodes: g.original.nodes.map((n) =>
          n.id === g.id ? {...n, labelOffset: offset[0] || offset[1] ? offset : null} : n,
        ),
      })
    } else if (g.type === 'move') {
      const raw = sub(position, g.start)
      const delta = snapEnabled ? snap(raw) : raw
      const chosen = g.original.nodes.filter((n) => selected(g.selection, 'node', n.id)),
        excluded = attachmentExclusions(
          g.original,
          chosen.map((n) => n.id),
        )
      const neighbors =
        chosen.length === 1
          ? new Set(
              g.original.edges
                .filter((e) => e.from === chosen[0].id || e.to === chosen[0].id)
                .flatMap((e) => [e.from, e.to]),
            )
          : new Set()
      const anchors = g.original.nodes
        .filter(
          (n) =>
            neighbors.has(n.id) &&
            !chosen.includes(n) &&
            !(n.attachment && excluded.has(n.attachment.edge)),
        )
        .map((n) => n.position)
      const placed =
        chosen.length === 1
          ? placement(
              chosen[0].position.map((x, i) => x + raw[i]),
              {anchors, exclude: excluded, forceAxis: event.shiftKey, source: g.original},
            )
          : null
      guide(placed)
      onPreview({
        ...g.original,
        nodes: g.original.nodes.map((n) =>
          selected(g.selection, 'node', n.id)
            ? {
                ...n,
                position:
                  placed && (placed.attachment || placed.axis)
                    ? placed.point
                    : n.position.map((x, i) => x + delta[i]),
                attachment: placed?.attachment || null,
              }
            : n,
        ),
        annotations: g.original.annotations.map((a) =>
          selected(g.selection, 'text', a.id)
            ? {...a, position: a.position.map((x, i) => x + delta[i])}
            : a,
        ),
      })
    } else if (g.type === 'marquee') setMarquee({start: g.start, end: position})
  }
  const pointerUp = (event) => {
    const g = gesture.current
    if (!g) return
    const position = coordinates(event)
    const moved =
      Math.hypot(event.clientX - g.screen[0], event.clientY - g.screen[1]) > CLICK
    gesture.current = null
    guide(null)
    if (g.type === 'press') {
      // A click selects; clicking the selected object again edits its label.
      const itemKey = g.node ? key('node', g.node.id) : g.edgeID && key('edge', g.edgeID)
      if (itemKey && g.wasSelected) onEditLabel()
      else if (itemKey) onSelection([itemKey])
    }
    if (g.type === 'move') {
      if (moved) onCommit()
      else {
        onPreview(g.original)
        if (g.focus) onEditLabel()
      }
    }
    if (g.type === 'label') {
      if (moved) onCommit()
      else {
        onPreview(g.original)
        onEditLabel()
      }
    }
    if (g.type === 'loop') {
      setLoopDrag(null)
      if (moved) onCommit()
      else onPreview(g.original)
    }
    if (g.type === 'edge') {
      const loop = loopTarget(g, position, event)
      if (loop) {
        onConnect(
          g.start,
          g.start,
          g.startID,
          g.startID,
          {from: g.startAttachment, to: g.startAttachment},
          loop,
        )
        reset()
        return
      }
      const placed = endpointPlacement(position, g.start, event)
      const endNode = placed.node
      const distinct = endNode
        ? endNode.id !== g.startID
        : length(sub(placed.point, g.start)) > 1e-6
      if (g.fromSelect) {
        if (distinct)
          onConnect(g.start, placed.point, g.startID, endNode?.id, {
            from: g.startAttachment,
            to: endNode?.attachment || placed.attachment,
          })
        reset()
      } else if (moved || g.hadConnection) {
        onConnect(g.start, placed.point, g.startID, endNode?.id, {
          from: g.startAttachment,
          to: endNode?.attachment || placed.attachment,
        })
        reset()
      } else {
        const existing = nodeAt(g.start)
        setConnection(existing || {position: g.start, attachment: g.startAttachment})
        connectionTrace.current = {
          start: g.start,
          reach: 0,
          apex: [0, 0],
          area: 0,
          last: null,
        }
        setDraft({start: g.start, end: g.start, source: existing?.id})
      }
    }
    if (g.type === 'marquee') {
      const left = Math.min(g.start[0], position[0]),
        right = Math.max(g.start[0], position[0]),
        top = Math.min(g.start[1], position[1]),
        bottom = Math.max(g.start[1], position[1])
      const contains = (p) =>
        p[0] >= left && p[0] <= right && p[1] >= top && p[1] <= bottom
      const nodes = moved ? diagram.nodes.filter((n) => contains(n.position)) : []
      const edges = diagram.edges.filter(
        (e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to),
      )
      const texts = moved ? diagram.annotations.filter((a) => contains(a.position)) : []
      onSelection([
        ...new Set([
          ...g.selection,
          ...nodes.map((n) => key('node', n.id)),
          ...edges.map((e) => key('edge', e.id)),
          ...texts.map((a) => key('text', a.id)),
        ]),
      ])
      setMarquee(null)
    }
  }
  const wheel = (event) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const zoom = Math.max(0.2, Math.min(3, view.zoom * Math.exp(-event.deltaY * 0.006)))
      const rect = host.current.getBoundingClientRect(),
        mx = event.clientX - rect.left - size[0] / 2,
        my = event.clientY - rect.top - size[1] / 2
      const ratio = zoom / view.zoom
      setView({zoom, x: mx - (mx - view.x) * ratio, y: my - (my - view.y) * ratio})
    } else setView((v) => ({...v, x: v.x - event.deltaX, y: v.y - event.deltaY}))
  }
  useEffect(() => {
    const element = host.current
    element.addEventListener('wheel', wheel, {passive: false})
    return () => element.removeEventListener('wheel', wheel)
  }, [view, size])

  const scene = useMemo(
    () => (
      <DiagramScene
        document={diagram}
        selection={selection}
        sceneRef={sceneRef}
        zoom={view.zoom}
      />
    ),
    [diagram, selection, view.zoom],
  )
  // Quiver-style dashed cell borders whose dashes cross at each corner; grid
  // points sit in the middle of cells, where quiver places its objects.
  const cell = GRID * view.zoom,
    dash = cell / 16,
    origin = [size[0] / 2 + view.x, size[1] / 2 + view.y]
  const transform = `translate(${origin[0]} ${origin[1]}) scale(${view.zoom})`
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]))
  const ring = (id, className) => {
    const n = nodes.get(id)
    if (!n) return null
    const zones = vertexZones(n, view.zoom)
    return (
      <circle
        class={className}
        cx={n.position[0]}
        cy={n.position[1]}
        r={className === 'move-ring' ? zones.hit : zones.core}
      />
    )
  }
  const selectedLoop =
    tool === 'select' && selection.length === 1 && selection[0].startsWith('edge:')
      ? diagram.edges.find((e) => key('edge', e.id) === selection[0] && e.from === e.to)
      : null
  const loopVertex = selectedLoop && nodes.get(selectedLoop.from)
  const loopApex =
    loopVertex &&
    add(
      edgeCurve(loopVertex, loopVertex, selectedLoop)(0.5).point,
      scale(angleVector(selectedLoop.loopAngle), HANDLE_GAP / view.zoom),
    )
  const draftShape = draft && (draft.loop || length(sub(draft.end, draft.start)) > 2)
  const hoverClass = hover?.zone ? ` hover-${hover.zone}` : ''
  return (
    <div
      ref={host}
      class={`canvas-host tool-${panHeld ? 'pan' : tool}${hoverClass}${draft ? ' drawing' : ''}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerLeave={() => !gesture.current && setHover(null)}
      onPointerCancel={() => {
        if (gesture.current?.original) onPreview(gesture.current.original)
        reset()
      }}
      onDblClick={(event) => {
        if (
          tool === 'select' &&
          !event.shiftKey &&
          !event.target.closest('[data-kind]') &&
          !nodeAt(coordinates(event))
        ) {
          const placed = placement(coordinates(event))
          onNode(placed.point, null, placed.attachment)
        }
      }}
    >
      <svg
        class="diagram-canvas"
        aria-label={t('Feynman 图画布')}
        width="100%"
        height="100%"
      >
        <defs>
          <pattern
            id="canvas-grid"
            width={cell}
            height={cell}
            patternUnits="userSpaceOnUse"
            x={origin[0]}
            y={origin[1]}
          >
            <path
              class="grid-line"
              d={`M${cell / 2} 0V${cell}M0 ${cell / 2}H${cell}`}
              fill="none"
              stroke-width={Math.max(1, 1.25 * view.zoom)}
              stroke-dasharray={dash}
              stroke-dashoffset={dash / 2}
            />
          </pattern>
        </defs>
        {showGrid && (
          <rect class="canvas-grid" width="100%" height="100%" fill="url(#canvas-grid)" />
        )}
        <g transform={transform}>
          <g class="interaction-under" pointer-events="none">
            {hover?.id &&
              ring(hover.id, hover.zone === 'ring' ? 'move-ring' : 'hover-core')}
            {draft?.source && ring(draft.source, 'hover-core')}
            {draft?.target && ring(draft.target, 'hover-core')}
          </g>
          {scene}
          {hover?.point && !draft && (
            <g class="focus-point" pointer-events="none">
              <circle cx={hover.point[0]} cy={hover.point[1]} r={11 / view.zoom} />
              <circle
                class="focus-dot"
                cx={hover.point[0]}
                cy={hover.point[1]}
                r={2.5 / view.zoom}
              />
            </g>
          )}
          {axisGuide && (
            <g class="axis-guide" data-axis={axisGuide.axis} pointer-events="none">
              <path
                d={`M${axisGuide.start.join(',')}L${axisGuide.end.join(',')}`}
                fill="none"
                stroke-width={1.5 / view.zoom}
                stroke-dasharray={`${4 / view.zoom} ${4 / view.zoom}`}
              />
            </g>
          )}
          {snapGuide && (
            <g class="snap-guide" pointer-events="none">
              <circle
                cx={snapGuide[0]}
                cy={snapGuide[1]}
                r={9 / view.zoom}
                stroke-width={2 / view.zoom}
              />
              <circle
                class="snap-dot"
                cx={snapGuide[0]}
                cy={snapGuide[1]}
                r={3 / view.zoom}
              />
            </g>
          )}
          {draft && (
            <g class="draft" pointer-events="none">
              {draftShape &&
                (draft.loop ? (
                  <EdgeShape
                    from={ghost('draft', draft.start)}
                    to={ghost('draft', draft.start)}
                    edge={makeEdge('draft', 'draft', line, {
                      loopAngle: draft.loop.angle,
                      loopClockwise: draft.loop.clockwise,
                      loopSize: draft.loop.size,
                    })}
                    preview
                  />
                ) : (
                  <EdgeShape
                    from={ghost('draft-start', draft.start)}
                    to={ghost('draft-end', draft.end)}
                    edge={makeEdge('draft-start', 'draft-end', line)}
                    preview
                  />
                ))}
              <circle
                class="draft-end"
                cx={draft.start[0]}
                cy={draft.start[1]}
                r={4 / view.zoom}
              />
              {!draft.loop && draftShape && (
                <circle
                  class="draft-end"
                  cx={draft.end[0]}
                  cy={draft.end[1]}
                  r={4 / view.zoom}
                />
              )}
            </g>
          )}
          {loopApex && (
            <g class="loop-handle-layer">
              {loopDrag && (
                <g class="loop-readout" pointer-events="none">
                  <path
                    d={`M${loopDrag.vertex.join(',')}L${loopApex.join(',')}`}
                    stroke-width={1.5 / view.zoom}
                    stroke-dasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                  />
                  <text
                    x={loopApex[0]}
                    y={loopApex[1] - 18 / view.zoom}
                    font-size={12 / view.zoom}
                    text-anchor="middle"
                  >
                    {`${loopDrag.loopAngle}°`}
                  </text>
                </g>
              )}
              <circle
                class="loop-handle"
                data-kind="loop-handle"
                data-id={selectedLoop.id}
                role="slider"
                aria-label={t('Loop direction')}
                aria-valuenow={selectedLoop.loopAngle}
                cx={loopApex[0]}
                cy={loopApex[1]}
                r={7 / view.zoom}
                stroke-width={2 / view.zoom}
              />
            </g>
          )}
          {marquee && (
            <rect
              class="marquee"
              x={Math.min(marquee.start[0], marquee.end[0])}
              y={Math.min(marquee.start[1], marquee.end[1])}
              width={Math.abs(marquee.end[0] - marquee.start[0])}
              height={Math.abs(marquee.end[1] - marquee.start[1])}
              stroke-width={1 / view.zoom}
            />
          )}
        </g>
      </svg>
    </div>
  )
}
