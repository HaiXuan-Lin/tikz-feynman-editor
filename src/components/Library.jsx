import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useState} from 'preact/hooks'
import {propagators, vertices} from '../core/catalog.mjs'
import {templates} from '../core/templates.mjs'
import {bounds} from '../core/geometry.mjs'
import {edge} from '../core/model.mjs'
import DiagramScene, {EdgeShape, VertexShape} from './DiagramScene'
import Icon from './Icon'

export function LinePreview({line}) {
  const from = {id: 'a', position: [8, 18], vertex: 'none', size: 0},
    to = {id: 'b', position: [92, 18], vertex: 'none', size: 0}
  return (
    <svg viewBox="0 0 100 36" class="line-preview">
      <EdgeShape from={from} to={to} edge={edge('a', 'b', line)} preview />
    </svg>
  )
}
function TemplatePreview({template}) {
  const doc = template.create(),
    box = bounds(doc, 35)
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      class="template-preview"
      aria-hidden="true"
    >
      <DiagramScene document={doc} preview />
    </svg>
  )
}
export default function Library({line, vertex, onLine, onVertex, onTemplate, onClose}) {
  const t = useI18n()

  const [tab, setTab] = useState('components')
  const [query, setQuery] = useState('')
  return (
    <aside class="panel library-panel" aria-label={t('组件库')}>
      <div class="panel-heading">
        <span>
          <Icon name="library" />
          {t('组件库')}
        </span>
        <button class="icon-button" aria-label={t('收起组件库')} onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <div class="panel-tabs">
        <button
          class={tab === 'components' ? 'active' : ''}
          onClick={() => setTab('components')}
        >
          {t('图形组件')}
        </button>
        <button
          class={tab === 'templates' ? 'active' : ''}
          onClick={() => setTab('templates')}
        >
          {t('常用模板')}
          <span>12</span>
        </button>
      </div>
      <div class="panel-scroll">
        {tab === 'components' ? (
          <>
            <div class="section-label">
              {t('传播子')}
              <span>{t('选择后拖动连线')}</span>
            </div>
            <div class="propagator-grid">
              {propagators.map((p) => (
                <button
                  class={`propagator-card ${line === p.id ? 'selected' : ''}`}
                  aria-label={t('绘制{0}', p.name)}
                  aria-pressed={line === p.id}
                  onClick={() => onLine(p.id)}
                >
                  <LinePreview line={p.id} />
                  <span>{t(p.name)}</span>
                  <small>{t(p.description)}</small>
                </button>
              ))}
            </div>
            <div class="section-label">
              {t('顶点')}
              <span>{t('选择后点击画布')}</span>
            </div>
            <div class="vertex-grid">
              {vertices.map((v) => (
                <button
                  class={vertex === v.id ? 'selected' : ''}
                  title={t(v.name)}
                  aria-label={t('添加{0}', v.name)}
                  onClick={() => onVertex(v.id)}
                >
                  <svg viewBox="-20 -20 40 40">
                    {v.id === 'none' ? (
                      <circle r="4" stroke="currentColor" fill="none" />
                    ) : (
                      <VertexShape
                        vertex={v.id}
                        color="#282a30"
                        size={v.id === 'blob' ? 4 : 6}
                      />
                    )}
                  </svg>
                  <span>{t(v.name)}</span>
                </button>
              ))}
            </div>
            <div class="library-tip">
              <Icon name="loop" />
              <p>{t('自环、多重边、反项插入与动量标签，可在选中图形后编辑。')}</p>
            </div>
          </>
        ) : (
          <>
            <input
              class="search-input"
              placeholder={t('搜索模板、QED、QCD…')}
              aria-label={t('搜索模板')}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <div class="template-list">
              {templates
                .filter((template) =>
                  `${t(template.name)} ${t(template.category)} ${t(template.subtitle)}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((template) => (
                  <button
                    class="template-card"
                    aria-label={t('插入{0}模板', template.name)}
                    onClick={() => onTemplate(template)}
                  >
                    <TemplatePreview template={template} />
                    <span class="template-info">
                      <b>{t(template.name)}</b>
                      <small>{t(template.subtitle)}</small>
                    </span>
                    <span class="template-category">{t(template.category)}</span>
                  </button>
                ))}
            </div>
            <p class="fine-print">
              {t('模板插入当前画布，保留已有图形。模板是可编辑的拓扑示例。')}
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
