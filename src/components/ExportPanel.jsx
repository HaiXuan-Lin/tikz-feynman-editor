import {useI18n} from './I18n'
import {h} from 'preact'
import {useState} from 'preact/hooks'
import {toTeX} from '../core/tex.mjs'
import {bounds} from '../core/geometry.mjs'
import {shareURL, encode} from '../core/share'
import {copyText, download, svgDocument} from '../core/files'
import Icon from './Icon'

export default function ExportPanel({
  document: diagram,
  sceneRef,
  onClose,
  notify,
  initialTab = 'tex',
}) {
  const t = useI18n()

  const [tab, setTab] = useState(initialTab),
    [standalone, setStandalone] = useState(false),
    [background, setBackground] = useState(true)
  const link = shareURL(diagram)
  const code =
    tab === 'tex'
      ? toTeX(diagram, {
          standalone,
          shareURL: window.location.protocol === 'file:' ? '' : link,
        })
      : tab === 'json'
        ? JSON.stringify(diagram, null, 2)
        : link
  const filename = diagram.title.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'diagram'
  const copy = async () => {
    try {
      await copyText(code)
      notify(t('已复制到剪贴板'))
    } catch (error) {
      notify(error.message, true)
    }
  }
  const save = async () => {
    try {
      if (tab === 'svg') {
        if (!window.MathJax?.Hub)
          throw new Error(t('数学标签尚未加载，请稍后再导出 SVG。'))
        await new Promise((resolve) => MathJax.Hub.Queue(resolve))
        const content = svgDocument(
          sceneRef.current,
          bounds(diagram, 80),
          diagram.title,
          background,
        )
        download(`${filename}.svg`, content, 'image/svg+xml')
      } else
        download(
          `${filename}.${tab === 'tex' ? 'tex' : 'json'}`,
          code,
          tab === 'tex' ? 'text/plain' : 'application/json',
        )
    } catch (error) {
      notify(error.message, true)
    }
  }
  return (
    <div
      class="modal-backdrop"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <section
        class="export-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('导出图形')}
      >
        <div class="modal-heading">
          <div>
            <h2>{t('导出图形')}</h2>
            <p>{t('从编辑画布到你的论文。')}</p>
          </div>
          <button class="icon-button" aria-label={t('关闭导出')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="export-tabs">
          {[
            ['tex', 'LaTeX'],
            ['svg', 'SVG'],
            ['json', t('项目 JSON')],
            ['link', t('分享链接')],
          ].map(([id, name]) => (
            <button class={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {name}
            </button>
          ))}
        </div>
        {tab === 'svg' ? (
          <div class="svg-export-info">
            <Icon name="export" size={36} />
            <h3>{t('可缩放矢量图')}</h3>
            <p>
              {t(
                '传播子、顶点和数学标签均作为矢量导出。包含内嵌字形，可用于论文与演示。',
              )}
            </p>
            <label class="check-field">
              <input
                type="checkbox"
                checked={background}
                onChange={(ev) => setBackground(ev.currentTarget.checked)}
              />
              {t('白色背景')}
            </label>
          </div>
        ) : (
          <textarea
            aria-label={t('导出内容')}
            class="code-editor"
            value={code}
            readonly
            spellcheck="false"
          />
        )}
        <div class="export-footer">
          <div>
            {tab === 'tex' && (
              <label class="check-field">
                <input
                  type="checkbox"
                  checked={standalone}
                  onChange={(ev) => setStandalone(ev.currentTarget.checked)}
                />
                {t('完整 LaTeX 文档')}
              </label>
            )}
            {tab === 'link' && (
              <small>
                {window.location.protocol === 'file:'
                  ? t('在另一台设备的新版编辑器中选择“导入”，粘贴此分享数据即可恢复。')
                  : t('接收方需使用此新版编辑器。')}
              </small>
            )}
          </div>
          <div class="button-row">
            {tab !== 'svg' && (
              <button class="secondary-button" onClick={copy}>
                <Icon name="copy" />
                {t('复制')}
              </button>
            )}
            {tab !== 'link' && (
              <button class="primary-button" onClick={save}>
                <Icon name="export" />
                {t('下载')}
                {tab === 'svg' ? ' SVG' : ''}
              </button>
            )}
            {tab === 'link' && window.location.protocol !== 'file:' && (
              <button
                class="primary-button"
                onClick={() => {
                  window.history.replaceState(null, '', `#${encode(diagram)}`)
                  notify(t('图形已保存到当前 URL'))
                }}
              >
                {t('保存到 URL')}
              </button>
            )}
          </div>
        </div>
        {tab === 'tex' && (
          <p class="export-note">
            {t('使用 TikZ-Feynman；坐标已显式指定。屏幕曲线与 TikZ 曲线可能略有差异。')}
          </p>
        )}
      </section>
    </div>
  )
}
