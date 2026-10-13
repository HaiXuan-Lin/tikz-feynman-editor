import {h} from 'preact'

const paths = {
  select: 'M5 3l14 9-6 1-3 6z',
  pan: 'M8 11V5a2 2 0 014 0v5-4 0m4 0V4a2 2 0 014 0v7m0-3a2 2 0 014 0v5c0 6-3 8-8 8-3 0-4-2-6-5l-2-4c-1-2 1-3 3-1l1 1',
  edge: 'M4 19L20 3M12 3h8v8',
  node: 'M12 4v16M4 12h16',
  text: 'M4 5h16M12 5v15M8 20h8',
  undo: 'M8 5L3 10l5 5M3 10h11a6 6 0 016 6',
  redo: 'M16 5l5 5-5 5M21 10H10a6 6 0 00-6 6',
  trash: 'M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14M10 11v6m4-6v6',
  copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  export: 'M12 16V3M7 8l5-5 5 5M4 14v7h16v-7',
  import: 'M12 3v13M7 11l5 5 5-5M4 16v5h16v-5',
  save: 'M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8',
  code: 'M8 6l-6 6 6 6m8-12l6 6-6 6m-3-15l-2 18',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  fit: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6M8 12h8m-4-4v8',
  grid: 'M3 3h18v18H3zM9 3v18m6-18v18M3 9h18M3 15h18',
  magnet: 'M5 3v10a7 7 0 0014 0V3h-5v10a2 2 0 01-4 0V3zM5 7h5m4 0h5',
  axes: 'M4 3v17h17M8 16V8h8M4 20l12-12',
  chevron: 'M9 5l7 7-7 7',
  close: 'M5 5l14 14M19 5L5 19',
  help: 'M9 8a3 3 0 116 0c0 3-3 2-3 5m0 4h.01',
  link: 'M9 15l6-6M8 17l-2 2a4 4 0 01-6-6l4-4a4 4 0 016 0m2-2l2-2a4 4 0 016 6l-4 4a4 4 0 01-6 0',
  loop: 'M8 18a8 8 0 118 0M6 17l2 4 4-2',
  reverse: 'M3 7h18l-4-4M21 17H3l4 4',
  check: 'M4 12l5 5L20 6',
  theme: 'M20 15A8 8 0 119 4a7 7 0 0011 11',
  library: 'M4 4h6v16H4zM14 4l5-1 3 16-5 1z',
  new: 'M4 3h10l6 6v12H4zM14 3v6h6M8 15h8m-4-4v8',
}
export default function Icon({name, size = 18}) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.node} />
    </svg>
  )
}
export function ToolButton({icon, label, shortcut, active, ...props}) {
  return (
    <button
      type="button"
      class={`tool-button ${active ? 'active' : ''}`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      {...props}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}
