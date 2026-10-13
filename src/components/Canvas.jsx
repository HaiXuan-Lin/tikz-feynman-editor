import {useI18n} from './I18n'
import {h} from 'preact'
import {useEffect, useRef, useState} from 'preact/hooks'
import DiagramScene from './DiagramScene'
import {GRID} from '../core/catalog.mjs'
import {bounds, length, sub, snapToGeometry} from '../core/geometry.mjs'
import {clone, key, selected, snap, attachmentExclusions} from '../core/model.mjs'

export default function Canvas({
  document: diagram,
  selection,
  onSelection,
  tool,
  panHeld,
  snapEnabled,
  snapToEdges,
  snapAxes,
  showGrid,
  onPreview,
  onCommit,
  onNode,
  onText,
  onConnect,
  fitToken,
  zoomAction,
  cancelToken,
  sceneRef,
  onZoom,
}) {
  const t = useI18n()

  const host = useRef(),
    gesture = useRef()
  const [size, setSize] = useState([900, 700])
  const [view, setView] = useState({x: 0, y: 0, zoom: 1})
  const [draft, setDraft] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const [connection, setConnection] = useState(null)
  const [snapGuide, setSnapGuide] = useState(null)
  const [axisGuide, setAxisGuide] = useState(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize([entry.contentRect.width, entry.contentRect.height]),
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const box = bounds(diagram, 100)
    const zoom = Math.max(
      0.2,
      Math.min(1.25, (size[0] - 80) / box.width, (size[1] - 100) / box.height),
    )
    setView({
      x: -(box.x + box.width / 2) * zoom,
      y: -(box.y + box.height / 2) * zoom,
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
  useEffect(() => {
    if (gesture.current?.original) onPreview(gesture.current.original)
    setDraft(null)
    setConnection(null)
    gesture.current = null
    setMarquee(null)
    setSnapGuide(null)
    setAxisGuide(null)
  }, [cancelToken, tool])

  const coordinates = (event) => {
    const rect = host.current.getBoundingClientRect()
    return [
      (event.clientX - rect.left - size[0] / 2 - view.x) / view.zoom,
      (event.clientY - rect.top - size[1] / 2 - view.y) / view.zoom,
    ]
  }
  const nodeAt = (point) =>
    diagram.nodes.find((n) => length(sub(n.position, point)) < 22 / view.zoom)
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
    setSnapGuide(placed.attachment ? placed.point : null)
    setAxisGuide(
      placed.axis ? {start: placed.anchor, end: placed.point, axis: placed.axis} : null,
    )
  }
  const pointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return
    const position = coordinates(event),
      target = event.target.closest('[data-kind]')
    host.current.setPointerCapture(event.pointerId)
    const screen = [event.clientX, event.clientY]
    if (tool === 'pan' || panHeld || event.button === 1) {
      gesture.current = {type: 'pan', screen, view}
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
      const placed = placement(position)
      const start = startNode ? startNode.position : placed.point
      gesture.current = {
        type: 'edge',
        start,
        startID: startNode?.id,
        screen,
        hadConnection: Boolean(connection),
        startAttachment: startNode?.attachment || placed.attachment,
      }
      setDraft({start, end: position})
      return
    }
    if (target) {
      const itemKey = key(target.dataset.kind, target.dataset.id)
      const next = event.shiftKey
        ? selection.includes(itemKey)
          ? selection.filter((k) => k !== itemKey)
          : [...selection, itemKey]
        : selection.includes(itemKey)
          ? selection
          : [itemKey]
      onSelection(next)
      if (target.dataset.kind === 'node' || target.dataset.kind === 'text')
        gesture.current = {
          type: 'move',
          start: position,
          screen,
          original: clone(diagram),
          selection: next,
        }
    } else {
      gesture.current = {
        type: 'marquee',
        start: position,
        screen,
        selection: event.shiftKey ? selection : [],
      }
      setMarquee({start: position, end: position})
      if (!event.shiftKey) onSelection([])
    }
  }
  const pointerMove = (event) => {
    const g = gesture.current
    const position = coordinates(event)
    if (!g) {
      if (connection) {
        const placed = endpointPlacement(position, connection.position, event)
        setDraft({start: connection.position, end: placed.point})
        guide(placed)
      } else if (tool === 'node' || tool === 'edge') guide(placement(position))
      return
    }
    if (g.type === 'pan') {
      setView({
        ...g.view,
        x: g.view.x + event.clientX - g.screen[0],
        y: g.view.y + event.clientY - g.screen[1],
      })
    } else if (g.type === 'edge') {
      const placed = endpointPlacement(position, g.start, event)
      guide(placed)
      setDraft({start: g.start, end: placed.point})
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
      if (placed) guide(placed)
      else {
        setSnapGuide(null)
        setAxisGuide(null)
      }
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
    const moved = Math.hypot(event.clientX - g.screen[0], event.clientY - g.screen[1]) > 4
    gesture.current = null
    setSnapGuide(null)
    setAxisGuide(null)
    if (g.type === 'move') {
      if (moved) onCommit()
      else onPreview(g.original)
    }
    if (g.type === 'edge') {
      const placed = endpointPlacement(position, g.start, event)
      const endNode = placed.node
      if (moved || g.hadConnection) {
        onConnect(g.start, placed.point, g.startID, endNode?.id, {
          from: g.startAttachment,
          to: endNode?.attachment || placed.attachment,
        })
        setConnection(null)
        setDraft(null)
      } else {
        const existing = nodeAt(g.start)
        setConnection(existing || {position: g.start, attachment: g.startAttachment})
        setDraft({start: g.start, end: g.start})
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
  const transform = `translate(${size[0] / 2 + view.x} ${size[1] / 2 + view.y}) scale(${view.zoom})`
  const gridSize = GRID * view.zoom
  return (
    <div
      ref={host}
      class={`canvas-host tool-${panHeld ? 'pan' : tool}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        if (gesture.current?.original) onPreview(gesture.current.original)
        gesture.current = null
        setDraft(null)
        setMarquee(null)
        setSnapGuide(null)
        setAxisGuide(null)
      }}
      onDblClick={(event) => {
        if (
          tool === 'select' &&
          event.target.closest('[data-kind]')?.dataset.kind !== 'node'
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
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            x={size[0] / 2 + view.x}
            y={size[1] / 2 + view.y}
          >
            <path
              d={`M${gridSize} 0H0V${gridSize}`}
              fill="none"
              stroke="#dfe2e7"
              stroke-width="1"
              stroke-dasharray="4 5"
            />
            <circle r="1.5" fill="#cdd2db" />
          </pattern>
        </defs>
        {showGrid && <rect width="100%" height="100%" fill="url(#canvas-grid)" />}
        <g transform={transform}>
          <DiagramScene document={diagram} selection={selection} sceneRef={sceneRef} />
          {axisGuide && (
            <g class="axis-guide" data-axis={axisGuide.axis} pointer-events="none">
              <path
                d={`M${axisGuide.start.join(',')}L${axisGuide.end.join(',')}`}
                fill="none"
                stroke="#5674bd"
                stroke-width={1 / view.zoom}
                stroke-dasharray="4 4"
              />
            </g>
          )}
          {snapGuide && (
            <g class="snap-guide" pointer-events="none">
              <circle
                cx={snapGuide[0]}
                cy={snapGuide[1]}
                r="9"
                fill="white"
                stroke="#5674bd"
                stroke-width="1.5"
              />
              <circle cx={snapGuide[0]} cy={snapGuide[1]} r="3" fill="#5674bd" />
            </g>
          )}
          {draft && (
            <g class="draft" pointer-events="none">
              <path
                d={`M${draft.start.join(',')}L${draft.end.join(',')}`}
                fill="none"
                stroke="#5674bd"
                stroke-width="1.7"
                stroke-dasharray="6 4"
              />
              <circle cx={draft.start[0]} cy={draft.start[1]} r="5" fill="#5674bd" />
              <circle
                cx={draft.end[0]}
                cy={draft.end[1]}
                r="7"
                fill="white"
                stroke="#5674bd"
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
              fill="#5674bd"
              fill-opacity=".08"
              stroke="#5674bd"
              stroke-width={1 / view.zoom}
            />
          )}
        </g>
      </svg>
    </div>
  )
}
