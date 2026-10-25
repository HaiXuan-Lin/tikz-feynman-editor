import {useI18n, useLocale} from './I18n'
import {h, Fragment} from 'preact'
import {useEffect, useRef, useState} from 'preact/hooks'
import Canvas from './Canvas'
import Library from './Library'
import Inspector from './Inspector'
import ExportPanel from './ExportPanel'
import Icon, {ToolButton} from './Icon'
import {GRID} from '../core/catalog.mjs'
import {
  History,
  clone,
  emptyDiagram,
  node,
  edge,
  annotation,
  key,
  selected,
  uid,
  parseDiagram,
  removeSelection,
  duplicateSelection,
  resolveAttachments,
  setCrossing,
  reorderEdges,
} from '../core/model.mjs'
import {bounds, crossingPlan, freeLoopAngle} from '../core/geometry.mjs'
import {getTemplate} from '../core/templates.mjs'
import {decode} from '../core/share'
import {download, pickProject} from '../core/files'

function loadInitial() {
  try {
    if (window.location.hash.length > 1) return decode(window.location.hash.slice(1))
    const saved = localStorage.getItem('feynman-editor-v2')
    if (saved) return parseDiagram(saved)
  } catch (error) {
    console.warn('Could not restore diagram:', error)
  }
  return getTemplate('self-energy').create()
}

export default function App() {
  const t = useI18n()
  const {language, setLanguage} = useLocale()

  const initial = useRef(null)
  if (!initial.current) initial.current = loadInitial()
  const [diagram, setDiagram] = useState(initial.current),
    docRef = useRef(diagram)
  const history = useRef(new History(initial.current)),
    sceneRef = useRef()
  const [selection, setSelection] = useState([]),
    [tool, setTool] = useState('select'),
    [line, setLine] = useState('fermion'),
    [vertex, setVertex] = useState('dot')
  const [libraryOpen, setLibraryOpen] = useState(true),
    [snapEnabled, setSnap] = useState(true),
    [snapToEdges, setSnapToEdges] = useState(true),
    [snapAxes, setSnapAxes] = useState(true),
    [showGrid, setGrid] = useState(true),
    [panHeld, setPanHeld] = useState(false)
  const [fitToken, setFit] = useState(0),
    [cancelToken, setCancel] = useState(0),
    [zoom, setZoom] = useState(1),
    [zoomAction, setZoomAction] = useState(null)
  const [modal, setModal] = useState(null),
    [exportTab, setExportTab] = useState('tex'),
    [importText, setImportText] = useState(''),
    [toast, setToast] = useState(null),
    toastTimer = useRef()
  const [mathReady, setMathReady] = useState(Boolean(window.MathJax?.isReady))
  const notify = (message, error = false) => {
    setToast({message: t(message), error})
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }
  const preview = (next) => {
    next = resolveAttachments(next)
    docRef.current = next
    setDiagram(next)
  }
  const commit = (next) => {
    const document = resolveAttachments(next || docRef.current)
    history.current.push(document)
    preview(document)
  }
  const restore = (next) => {
    preview(next)
    setSelection([])
    setCancel((x) => x + 1)
  }
  const undo = () => restore(history.current.undo()),
    redo = () => restore(history.current.redo())
  const deleteSelected = () => {
    commit(removeSelection(docRef.current, selection))
    setSelection([])
  }
  const duplicate = () => {
    const result = duplicateSelection(docRef.current, selection)
    commit(result.document)
    setSelection(result.selection)
  }
  const update = (props) => {
    const current = docRef.current
    const change = (item, kind) => {
      if (!selected(selection, kind, item.id)) return item
      const allowed =
        kind === 'node'
          ? ['value', 'vertex', 'position', 'size', 'color', 'attachment', 'labelOffset']
          : kind === 'text'
            ? ['value', 'position', 'size', 'color']
            : [
                'value',
                'line',
                'arrow',
                'arrowAt',
                'arrowAt2',
                'momentum',
                'bend',
                'curve',
                'ellipseRatio',
                'labelPosition',
                'labelAt',
                'momentumPosition',
                'momentumAt',
                'momentumDistance',
                'crossingGap',
                'gapSize',
                'loopAngle',
                'loopClockwise',
                'loopSpread',
                'loopSize',
                'insertion',
                'color',
                'width',
              ]
      return {
        ...item,
        ...(kind === 'node' && props.position ? {attachment: null} : {}),
        ...Object.fromEntries(Object.entries(props).filter(([k]) => allowed.includes(k))),
      }
    }
    let next = {
      ...current,
      nodes: current.nodes.map((n) => change(n, 'node')),
      edges: current.edges.map((e) => change(e, 'edge')),
      annotations: current.annotations.map((a) => change(a, 'text')),
      crossings:
        props.crossingGap === undefined
          ? current.crossings
          : (current.crossings || []).filter(
              (c) => !c.edges.some((id) => selected(selection, 'edge', id)),
            ),
    }
    if (props.gapSize !== undefined)
      for (const crossing of crossingPlan(current).crossings.filter((c) =>
        c.edges.some((id) => selected(selection, 'edge', id)),
      ))
        next = setCrossing(next, crossing, {gapSize: props.gapSize})
    commit(next)
  }
  const addNode = (position, id, attachment = null) => {
    if (id) {
      setSelection([key('node', id)])
      return
    }
    const n = node(...position, {vertex, attachment})
    commit({...docRef.current, nodes: [...docRef.current.nodes, n]})
    setSelection([key('node', n.id)])
  }
  const addText = (position) => {
    const text = annotation(...position)
    commit({...docRef.current, annotations: [...docRef.current.annotations, text]})
    setSelection([key('text', text.id)])
  }
  const connect = (
    fromPosition,
    toPosition,
    fromID,
    toID,
    attachments = {},
    loop = null,
  ) => {
    const current = clone(docRef.current)
    const endpoint = (id, position, attachment) => {
      const existing = id
        ? current.nodes.find((n) => n.id === id)
        : current.nodes.find(
            (n) =>
              Math.hypot(n.position[0] - position[0], n.position[1] - position[1]) < 5,
          )
      if (existing) return existing.id
      const n = node(...position, {vertex: 'none', attachment: attachment || null})
      current.nodes.push(n)
      return n.id
    }
    const from = endpoint(fromID, fromPosition, attachments.from),
      to = endpoint(toID, toPosition, attachments.to)
    if (from === to && !loop) return
    const parallel = current.edges.filter(
      (e) =>
        from !== to &&
        ((e.from === from && e.to === to) || (e.from === to && e.to === from)),
    )
    const e = edge(
      from,
      to,
      line,
      from === to
        ? {
            loopAngle: loop.angle ?? freeLoopAngle(current, from),
            loopClockwise: loop.clockwise ?? true,
            loopSize: loop.size ?? 60,
          }
        : {bend: parallel.length ? Math.min(85, parallel.length * 35) : 0},
    )
    current.edges.push(e)
    commit(current)
    setSelection([key('edge', e.id)])
  }
  const addLoop = () => {
    const n = docRef.current.nodes.find((n) => selected(selection, 'node', n.id))
    if (!n) return
    const e = edge(n.id, n.id, line, {loopAngle: freeLoopAngle(docRef.current, n.id)})
    commit({...docRef.current, edges: [...docRef.current.edges, e]})
    setSelection([key('edge', e.id)])
  }
  // Reversing a loop flips its orientation; labels keep their side on screen.
  const swapSide = (side) => ({left: 'right', right: 'left'})[side] || side
  const reverse = () =>
    commit({
      ...docRef.current,
      nodes: docRef.current.nodes.map((n) =>
        n.attachment && selected(selection, 'edge', n.attachment.edge)
          ? {...n, attachment: {...n.attachment, t: 1 - n.attachment.t}}
          : n,
      ),
      edges: docRef.current.edges.map((e) =>
        !selected(selection, 'edge', e.id)
          ? e
          : e.from === e.to
            ? {
                ...e,
                loopClockwise: !e.loopClockwise,
                labelPosition: swapSide(e.labelPosition),
                momentumPosition: swapSide(e.momentumPosition),
              }
            : {...e, from: e.to, to: e.from, bend: -e.bend},
      ),
    })
  const editLabel = () => {
    requestAnimationFrame(() => {
      const input = document.getElementById('label-input')
      input?.focus()
      input?.select()
    })
  }
  const insertTemplate = (template) => {
    const current = docRef.current,
      addition = template.create()
    if (current.nodes.length || current.annotations.length) {
      const b = bounds(current, 50),
        a = bounds(addition, 0),
        delta = [b.x + b.width + 120 - a.x, -(a.y + a.height / 2)]
      addition.nodes = addition.nodes.map((n) => ({
        ...n,
        position: n.position.map((x, i) => x + delta[i]),
      }))
    }
    commit({
      ...current,
      title: current.nodes.length ? current.title : addition.title,
      nodes: [...current.nodes, ...addition.nodes],
      edges: [...current.edges, ...addition.edges],
    })
    setSelection([
      ...addition.nodes.map((n) => key('node', n.id)),
      ...addition.edges.map((e) => key('edge', e.id)),
    ])
    setFit((x) => x + 1)
    setTool('select')
    notify(t('已插入{0}', template.name))
  }
  const newDocument = () => {
    if (diagram.nodes.length || diagram.annotations.length) setModal('new')
    else {
      commit(emptyDiagram())
      setFit((x) => x + 1)
    }
  }
  const importDocument = (text) => {
    try {
      const value = text.trim()
      const imported = value.startsWith('feynman:v2:')
        ? decode(value.slice(11))
        : value.startsWith('{')
          ? parseDiagram(value)
          : decode(value.includes('#') ? value.split('#').slice(1).join('#') : value)
      commit(imported)
      setSelection([])
      setFit((x) => x + 1)
      setModal(null)
      setImportText('')
      notify(t('项目已导入'))
    } catch (error) {
      notify(t('导入失败：{0}', error.message), true)
    }
  }
  const openProject = async () => {
    try {
      const text = await pickProject()
      if (text) importDocument(text)
    } catch (error) {
      notify(error.message, true)
    }
  }
  const saveProject = () =>
    download(
      `${diagram.title.replace(/[\\/:*?"<>|]/g, '-') || 'diagram'}.feynman`,
      JSON.stringify(docRef.current, null, 2),
      'application/json',
    )
  const zoomBy = (factor) => setZoomAction({factor, id: uid('z')})
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('feynman-editor-v2', JSON.stringify(diagram))
      } catch (_) {
        /* project downloads remain available */
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [diagram])
  useEffect(() => {
    const ready = () => setMathReady(true)
    if (window.MathJax?.isReady) ready()
    window.addEventListener('math-ready', ready)
    return () => window.removeEventListener('math-ready', ready)
  }, [])
  useEffect(() => {
    const open = (event) => importDocument(event.detail)
    const hash = () => {
      if (window.location.hash.length > 1) importDocument(window.location.hash.slice(1))
    }
    window.addEventListener('native-open-project', open)
    window.addEventListener('hashchange', hash)
    return () => {
      window.removeEventListener('native-open-project', open)
      window.removeEventListener('hashchange', hash)
    }
  }, [])
  useEffect(() => {
    const command = (event) => {
      const actions = {
        undo,
        redo,
        save: saveProject,
        open: openProject,
        new: newDocument,
        export: () => setModal('export'),
        selectAll: () =>
          setSelection([
            ...diagram.nodes.map((n) => key('node', n.id)),
            ...diagram.edges.map((e) => key('edge', e.id)),
            ...diagram.annotations.map((a) => key('text', a.id)),
          ]),
      }
      actions[event.detail]?.()
    }
    window.addEventListener('native-command', command)
    return () => window.removeEventListener('native-command', command)
  }, [diagram, selection])
  useEffect(() => {
    const down = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!modal) setSelection([])
        setModal(null)
        setCancel((x) => x + 1)
        return
      }
      const typing = event.target.closest(
        'input,textarea,select,[contenteditable="true"]',
      )
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveProject()
        return
      }
      if (command && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setModal('export')
        return
      }
      if (command && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        openProject()
        return
      }
      if (typing || modal) return
      if (event.key === ' ') {
        event.preventDefault()
        setPanHeld(true)
        return
      }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }
      if (command && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelection([
          ...diagram.nodes.map((n) => key('node', n.id)),
          ...diagram.edges.map((e) => key('edge', e.id)),
          ...diagram.annotations.map((a) => key('text', a.id)),
        ])
        return
      }
      if (command && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicate()
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        editLabel()
        return
      }
      const tools = {v: 'select', p: 'pan', n: 'node', a: 'edge', t: 'text'}
      if (tools[event.key.toLowerCase()] && !command) {
        setTool(tools[event.key.toLowerCase()])
        return
      }
      if (event.key === '?') {
        setModal('help')
        return
      }
      if (event.key === 'g' && !command) {
        setFit((x) => x + 1)
        return
      }
      if (event.key === 'h' && !command) {
        setGrid((v) => !v)
        return
      }
      if (event.key === 'r' && !command) {
        reverse()
        return
      }
      const directions = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      if (directions[event.key] && selection.length) {
        event.preventDefault()
        const delta = directions[event.key].map((x) => x * (event.altKey ? 1 : GRID / 2))
        commit({
          ...diagram,
          nodes: diagram.nodes.map((n) =>
            selected(selection, 'node', n.id)
              ? {...n, attachment: null, position: n.position.map((x, i) => x + delta[i])}
              : n,
          ),
          annotations: diagram.annotations.map((a) =>
            selected(selection, 'text', a.id)
              ? {...a, position: a.position.map((x, i) => x + delta[i])}
              : a,
          ),
        })
      }
    }
    const up = (event) => {
      if (event.key === ' ') setPanHeld(false)
    }
    const blur = () => setPanHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [diagram, selection, modal])
  const labelItem =
    selection.length === 1
      ? diagram.nodes.find((n) => selected(selection, 'node', n.id)) ||
        diagram.edges.find((e) => selected(selection, 'edge', e.id)) ||
        diagram.annotations.find((a) => selected(selection, 'text', a.id))
      : null
  const hints = {
    select: t(
      'Drag from a vertex or empty space to draw · drag beside a vertex to move it',
    ),
    node: t('点击添加 · 拖动顶点可移动'),
    edge: t('拖动连线，或依次点击两个端点'),
    text: t('点击放置标注'),
    pan: t('平移画布'),
  }
  const openExport = (tab) => {
    setExportTab(tab)
    setModal('export')
  }
  const insets = {left: libraryOpen ? 296 : 72, right: 320, top: 92, bottom: 110}
  return (
    <div class={`editor-app ${libraryOpen ? '' : 'library-collapsed'}`}>
      <section class="canvas-region">
        <Canvas
          document={diagram}
          selection={selection}
          onSelection={setSelection}
          tool={tool}
          line={line}
          panHeld={panHeld}
          snapEnabled={snapEnabled}
          snapToEdges={snapToEdges}
          snapAxes={snapAxes}
          showGrid={showGrid}
          insets={insets}
          onPreview={preview}
          onCommit={() => commit()}
          onNode={addNode}
          onText={addText}
          onConnect={connect}
          onEditLabel={editLabel}
          fitToken={fitToken}
          zoomAction={zoomAction}
          cancelToken={cancelToken}
          sceneRef={sceneRef}
          onZoom={setZoom}
        />
        {!diagram.nodes.length && !diagram.annotations.length && (
          <div class="empty-canvas-message">
            <span>{t('从一条传播子开始。')}</span>
            <p>
              {t('Drag anywhere on the grid to draw a propagator, or insert a template.')}
            </p>
          </div>
        )}
      </section>
      <header class="brand">
        <div class="brand-name">
          <img src="./img/app-icon.svg" width="30" height="30" alt="" />
          <span>TikZ Feynman Editor</span>
        </div>
        <div class="document-title">
          <input
            aria-label={t('图形名称')}
            value={diagram.title}
            onInput={(event) =>
              commit({...docRef.current, title: event.currentTarget.value})
            }
          />
          <span class="save-indicator" title={t('本地自动保存')}>
            <i />
          </span>
        </div>
      </header>
      <div class="global-toolbar toolbar" role="toolbar" aria-label={t('项目工具栏')}>
        <div class="toolbar-section">
          <ToolButton icon="new" label={t('新建')} onClick={newDocument} />
          <ToolButton
            icon="import"
            label={t('Open')}
            shortcut="⌘O"
            onClick={() => setModal('import')}
          />
          <ToolButton icon="save" label={t('Save')} shortcut="⌘S" onClick={saveProject} />
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="undo"
            label={t('撤销')}
            shortcut="⌘Z"
            disabled={!history.current.canUndo}
            onClick={undo}
          />
          <ToolButton
            icon="redo"
            label={t('重做')}
            shortcut="⇧⌘Z"
            disabled={!history.current.canRedo}
            onClick={redo}
          />
        </div>
        <div class="toolbar-section" role="group" aria-label={t('绘图工具')}>
          {[
            ['select', 'select', t('选择'), 'V'],
            ['node', 'node', t('顶点'), 'N'],
            ['edge', 'edge', t('连线'), 'A'],
            ['text', 'text', t('标注'), 'T'],
            ['pan', 'pan', t('平移'), 'P'],
          ].map(([id, icon, label, shortcut]) => (
            <ToolButton
              icon={icon}
              label={label}
              shortcut={shortcut}
              active={tool === id}
              onClick={() => setTool(id)}
            />
          ))}
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="trash"
            label={t('删除')}
            shortcut="⌫"
            disabled={!selection.length}
            onClick={deleteSelected}
          />
          <ToolButton
            icon="fit"
            label={t('居中')}
            shortcut="G"
            onClick={() => setFit((x) => x + 1)}
          />
          <ToolButton
            icon="grid"
            label={t('网格')}
            toggle
            shortcut="H"
            active={showGrid}
            onClick={() => setGrid((v) => !v)}
          />
          <div class="dropdown">
            <ToolButton
              icon="magnet"
              label={t('Snap')}
              toggle
              shortcut="▾"
              active={snapEnabled || snapToEdges || snapAxes}
              aria-haspopup="true"
            />
            <div class="subtoolbar" role="group" aria-label={t('Snap')}>
              <ToolButton
                icon="grid"
                label={t('吸附')}
                toggle
                active={snapEnabled}
                onClick={() => setSnap((v) => !v)}
              />
              <ToolButton
                icon="link"
                label={t('Snap to edges')}
                toggle
                active={snapToEdges}
                onClick={() => setSnapToEdges((v) => !v)}
              />
              <ToolButton
                icon="axes"
                label={t('Snap H/V')}
                toggle
                active={snapAxes}
                onClick={() => setSnapAxes((v) => !v)}
              />
            </div>
          </div>
        </div>
        <div class="toolbar-section">
          <ToolButton
            icon="help"
            label={t('快捷键')}
            shortcut="?"
            onClick={() => setModal('help')}
          />
        </div>
      </div>
      <button
        class="language-toggle"
        aria-label={t('Language')}
        onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      >
        <span class={language === 'en' ? 'active' : ''}>EN</span>
        <span class={language === 'zh' ? 'active' : ''}>中文</span>
      </button>
      {libraryOpen ? (
        <Library
          line={line}
          vertex={vertex}
          onLine={(id) => {
            setLine(id)
            if (!['select', 'edge'].includes(tool)) setTool('select')
          }}
          onVertex={(id) => {
            setVertex(id)
            setTool('node')
          }}
          onTemplate={insertTemplate}
          onClose={() => setLibraryOpen(false)}
        />
      ) : (
        <button
          class="library-toggle"
          aria-label={t('打开组件库')}
          title={t('打开组件库')}
          onClick={() => setLibraryOpen(true)}
        >
          <Icon name="library" />
        </button>
      )}
      <Inspector
        document={diagram}
        selection={selection}
        onUpdate={update}
        onDelete={deleteSelected}
        onDuplicate={duplicate}
        onLoop={addLoop}
        onReverse={reverse}
        onAutoLoop={() => {
          const e = docRef.current.edges.find((e) => selected(selection, 'edge', e.id))
          if (e) update({loopAngle: freeLoopAngle(docRef.current, e.from, e.id)})
        }}
        onLayer={(front) => commit(reorderEdges(docRef.current, selection, front))}
        onCrossing={(crossing, changes) => {
          let next = setCrossing(docRef.current, crossing, changes)
          if (changes.enabled === true)
            next = {
              ...next,
              edges: next.edges.map((e) =>
                crossing.edges.includes(e.id) ? {...e, crossingGap: true} : e,
              ),
            }
          commit(next)
        }}
      />
      <div class={`label-input-container ${labelItem ? '' : 'idle'}`}>
        <input
          id="label-input"
          class="label-input"
          aria-label={t('数学标签')}
          spellcheck="false"
          autocomplete="off"
          disabled={!labelItem}
          placeholder={
            labelItem
              ? t('TeX label, e.g. e^-, \\gamma, p_1')
              : hints[panHeld ? 'pan' : tool]
          }
          value={labelItem ? labelItem.value : ''}
          onInput={(event) => update({value: event.currentTarget.value})}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.blur()
            }
          }}
        />
        {labelItem && <span class="label-kind">TeX</span>}
      </div>
      <div class="global export-bar" role="toolbar" aria-label={t('导出')}>
        <span class="export-caption">{t('导出')}</span>
        {[
          ['tex', 'LaTeX'],
          ['svg', 'SVG'],
          ['json', 'JSON'],
          ['link', t('分享链接')],
        ].map(([id, name]) => (
          <button onClick={() => openExport(id)}>{name}</button>
        ))}
        <span class="zoom-controls">
          <button aria-label={t('缩小')} onClick={() => zoomBy(1 / 1.2)}>
            <Icon name="minus" size={15} />
          </button>
          <button
            class="zoom-number"
            title={t('居中')}
            onClick={() => setFit((x) => x + 1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button aria-label={t('放大')} onClick={() => zoomBy(1.2)}>
            <Icon name="plus" size={15} />
          </button>
        </span>
      </div>
      <footer class="app-status" aria-live="polite">
        {t('{0} vertices · {1} propagators', diagram.nodes.length, diagram.edges.length)}
        {selection.length > 0 && ` · ${t('{0} selected', selection.length)}`}
        {!mathReady && ` · ${t('数学标签加载中…')}`}
      </footer>
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          class={`toast ${toast.error ? 'error' : ''}`}
        >
          <Icon name={toast.error ? 'close' : 'check'} size={17} />
          {toast.message}
        </div>
      )}
      {modal === 'export' && (
        <ExportPanel
          initialTab={exportTab}
          document={diagram}
          sceneRef={sceneRef}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === 'import' && (
        <div class="modal-backdrop">
          <section
            class="import-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('导入项目')}
          >
            <div class="modal-heading">
              <div>
                <h2>{t('导入项目')}</h2>
                <p>{t('打开项目文件，或粘贴 JSON / 分享数据 / 旧版链接。')}</p>
              </div>
              <button
                class="icon-button"
                aria-label={t('关闭导入')}
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <button class="secondary-button full-width" onClick={openProject}>
              <Icon name="import" />
              {t('选择 .feynman / JSON 文件')}
            </button>
            <textarea
              class="code-editor"
              aria-label={t('导入数据')}
              placeholder={t('在此粘贴图形数据…')}
              value={importText}
              onInput={(e) => setImportText(e.currentTarget.value)}
            />
            <div class="button-row justify-end">
              <button class="secondary-button" onClick={() => setModal(null)}>
                {t('取消')}
              </button>
              <button
                class="primary-button"
                disabled={!importText.trim()}
                onClick={() => importDocument(importText)}
              >
                {t('导入图形')}
              </button>
            </div>
          </section>
        </div>
      )}
      {modal === 'new' && (
        <div class="modal-backdrop">
          <section
            class="confirm-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('新建图形')}
          >
            <h2>{t('创建空白图形？')}</h2>
            <p>{t('可先保存当前项目。清空后仍可使用撤销恢复。')}</p>
            <div class="button-row justify-end">
              <button class="secondary-button" onClick={() => setModal(null)}>
                {t('取消')}
              </button>
              <button
                class="primary-button"
                onClick={() => {
                  commit(emptyDiagram())
                  setSelection([])
                  setFit((x) => x + 1)
                  setModal(null)
                  window.history.replaceState(
                    null,
                    '',
                    window.location.href.split('#')[0],
                  )
                }}
              >
                {t('新建')}
              </button>
            </div>
          </section>
        </div>
      )}
      {modal === 'help' && (
        <div class="modal-backdrop">
          <section
            class="help-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('快捷键')}
          >
            <div class="modal-heading">
              <div>
                <h2>{t('让绘图更快一点')}</h2>
                <p>{t('鼠标与键盘都能完成编辑。')}</p>
              </div>
              <button
                class="icon-button"
                aria-label={t('关闭快捷键')}
                onClick={() => setModal(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div class="help-grid">
              {[
                [t('Draw a propagator'), t('Drag from a vertex or empty space')],
                [t('Self-loop'), t('Drag out of a vertex and back')],
                [t('Move a vertex'), t('Drag just beside it')],
                [t('Rotate or resize a loop'), t('Drag its handle (Shift: 15°)')],
                [t('选择 / 顶点 / 连线'), 'V / N / A'],
                [t('标注 / 平移'), 'T / P'],
                [t('临时平移'), t('Space + 拖动')],
                [t('画布平移'), t('滚动')],
                [t('画布缩放'), t('⌘ / Ctrl + 滚动')],
                [t('多选 / 框选'), t('Shift + 点击 / 拖动')],
                [t('编辑数学标签'), t('Enter / click again')],
                [t('移动选中图形'), t('方向键')],
                [t('精细移动'), t('Alt + 方向键')],
                [t('反转传播子'), 'R'],
                [t('撤销 / 重做'), '⌘Z / ⇧⌘Z'],
                [t('复制选中图形'), '⌘D'],
                [t('保存 / 打开项目'), '⌘S / ⌘O'],
                [t('导出'), '⌘E'],
                [t('居中 / 网格'), 'G / H'],
                [t('删除 / 取消'), 'Delete / Esc'],
              ].map(([label, shortcut]) => (
                <div>
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}
            </div>
            <p class="fine-print">
              {t(
                'Windows / Linux 使用 Ctrl 代替 ⌘。复杂公式可直接输入 TeX；图形可自由连接，不校验物理过程。',
              )}
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
