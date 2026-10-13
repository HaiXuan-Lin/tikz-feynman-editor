import {h} from 'preact'
import {useEffect, useRef} from 'preact/hooks'

// MathJax renders into an isolated HTML host; Preact owns the surrounding group.
// Local SVG glyph definitions travel with the exported SVG, without web fonts.
export default function MathLabel({
  value,
  x = 0,
  y = 0,
  color = '#282a30',
  size = 18,
  onMeasure,
}) {
  const group = useRef()
  useEffect(() => {
    let cancelled = false,
      started = false
    const host = document.createElement('span')
    host.style.cssText = `position:fixed;left:-10000px;top:0;font-size:${size}px;color:${color};white-space:nowrap;`
    host.textContent = `\\(${value}\\)`
    const typeset = () => {
      if (!value || cancelled || started || !window.MathJax?.Hub) return
      started = true
      document.body.appendChild(host)
      MathJax.Hub.Queue(['Typeset', MathJax.Hub, host], () => {
        const source = host.querySelector('svg')
        if (!cancelled && source && group.current) {
          const svg = source.cloneNode(true)
          const viewBox = source.getAttribute('viewBox').split(/\s+/).map(Number)
          // MathJax may still hide its host while completing the output pass.
          // Its SVG font coordinates use 1000 units per em, independent of layout.
          const width = (viewBox[2] * size) / 1000,
            height = (viewBox[3] * size) / 1000
          onMeasure?.({width, height})
          svg.setAttribute('x', -width / 2)
          svg.setAttribute('y', -height / 2)
          svg.setAttribute('width', width)
          svg.setAttribute('height', height)
          svg.style.cssText = 'overflow:visible;'
          group.current.replaceChildren(svg)
        }
        host.remove()
      })
    }
    typeset()
    window.addEventListener('math-ready', typeset)
    return () => {
      cancelled = true
      host.remove()
      window.removeEventListener('math-ready', typeset)
    }
  }, [value, color, size])
  if (!value) return null
  return (
    <g
      class="math-label"
      transform={`translate(${x} ${y})`}
      color={color}
      fill={color}
      pointer-events="none"
    >
      <g ref={group}>
        <text
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Georgia,serif"
          font-size={size}
        >
          {value}
        </text>
      </g>
    </g>
  )
}
