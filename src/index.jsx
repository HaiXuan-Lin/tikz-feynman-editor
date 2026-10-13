import {h, render} from 'preact'
import App from './components/App'
import {I18nProvider} from './components/I18n'

// The editor always starts even if the optional math renderer fails to load.
render(
  <I18nProvider>
    <App />
  </I18nProvider>,
  document.getElementById('app'),
)
function configureMath() {
  if (!window.MathJax?.Hub) return
  MathJax.Hub.Config({
    messageStyle: 'none',
    skipStartupTypeset: true,
    showMathMenu: false,
    SVG: {useGlobalCache: false, font: 'TeX'},
    TeX: {extensions: ['AMSmath.js', 'AMSsymbols.js']},
  })
  MathJax.Hub.processSectionDelay = 0
  MathJax.Hub.processUpdateDelay = 0
  MathJax.Hub.Queue(() => {
    MathJax.isReady = true
    window.dispatchEvent(new Event('math-ready'))
  })
}
if (window.MathJax?.Hub) configureMath()
else window.addEventListener('mathjax-loaded', configureMath, {once: true})
