import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import {propagators, vertices, colors, lineStyle, doubleArrow} from '../core/catalog.mjs'
import {selected} from '../core/model.mjs'
import {crossingPlan} from '../core/geometry.mjs'
import Icon from './Icon'
import {LinePreview} from './Library'

function Field({label, children, hint}) {
  return (
    <div class="field" role="group" aria-label={label}>
      <span class="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  )
}
function NumberField({label, value, onChange, min, max, step = 1}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onInput={(e) => {
          const n = Number(e.currentTarget.value)
          if (Number.isFinite(n))
            onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)))
        }}
      />
    </Field>
  )
}
function PercentageField({label, value, onChange, min = 1, max = 99, hint}) {
  const percentage = Math.round(value * 100)
  const [draft, setDraft] = useState(String(percentage))
  useEffect(() => setDraft(String(percentage)), [percentage])
  const change = (ev) => {
    const text = ev.currentTarget.value
    const next = text.trim() ? Number(text) : NaN
    if (!Number.isFinite(next)) {
      setDraft(String(percentage))
      return
    }
    const bounded = Math.max(min, Math.min(max, Math.round(next)))
    setDraft(String(bounded))
    onChange(bounded / 100)
  }
  return (
    <Field label={label} hint={hint}>
      <div class="percentage-control">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step="1"
          value={percentage}
          onInput={change}
        />
        <input
          aria-label={`${label} (%)`}
          type="number"
          min={min}
          max={max}
          step="1"
          value={draft}
          onInput={(ev) => setDraft(ev.currentTarget.value)}
          onBlur={change}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') ev.currentTarget.blur()
          }}
        />
        <span>%</span>
      </div>
    </Field>
  )
}
export default function Inspector({
  document,
  selection,
  onUpdate,
  onDelete,
  onDuplicate,
  onLoop,
  onReverse,
  onLayer,
  onCrossing,
}) {
  const t = useI18n()

  const n = document.nodes.find((n) => selected(selection, 'node', n.id)),
    e = document.edges.find((e) => selected(selection, 'edge', e.id)),
    a = document.annotations.find((a) => selected(selection, 'text', a.id))
  const single = selection.length === 1,
    item = single ? n || e || a : null
  const type = single
    ? n
      ? t('顶点')
      : e
        ? t('传播子')
        : t('文字标注')
    : t('{0} 个图形', selection.length)
  const update = (props) => onUpdate(props)
  if (!selection.length)
    return (
      <aside class="panel inspector-panel empty-inspector" aria-label={t('属性面板')}>
        <div class="panel-heading">
          <span>{t('图形属性')}</span>
        </div>
        <div class="inspector-placeholder">
          <Icon name="select" size={26} />
          <h3>{t('选择一个图形')}</h3>
          <p>{t('点击顶点或传播子，编辑标签、线型与几何属性。')}</p>
          <div class="shortcut-hints">
            <span>
              {t('多选')}
              <kbd>Shift</kbd>
            </span>
            <span>
              {t('框选')}
              <kbd>{t('拖动画布')}</kbd>
            </span>
            <span>
              {t('添加顶点')}
              <kbd>{t('双击')}</kbd>
            </span>
            <span>
              {t('平移')}
              <kbd>{t('Space + 拖动')}</kbd>
            </span>
          </div>
        </div>
      </aside>
    )
  return (
    <aside class="panel inspector-panel" aria-label={t('属性面板')}>
      <div class="panel-heading">
        <span>{type}</span>
        <span class="selection-count">{t('已选中')}</span>
      </div>
      <div class="panel-scroll">
        {single && e && (
          <div class="selected-propagator">
            <LinePreview line={e.line} />
            <span>
              {t(lineStyle(e.line).name)}
              {e.from === e.to ? t(' · 自环') : ''}
            </span>
          </div>
        )}
        {single && (
          <Field label={t('数学标签')} hint="TeX">
            <input
              id="label-input"
              aria-label={t('数学标签')}
              placeholder={a ? '\\mathcal{M} =' : t('例如 e^-, \\gamma, p_1')}
              value={item.value}
              onInput={(ev) => update({value: ev.currentTarget.value})}
            />
          </Field>
        )}
        {single && e && (
          <>
            <Field label={t('传播子类型')}>
              <select
                aria-label={t('传播子类型')}
                value={e.line}
                onChange={(ev) =>
                  update({
                    line: ev.currentTarget.value,
                    arrow: lineStyle(ev.currentTarget.value).arrow,
                    arrowAt: doubleArrow(lineStyle(ev.currentTarget.value).arrow)
                      ? 0.35
                      : 0.5,
                  })
                }
              >
                {propagators.map((p) => (
                  <option value={p.id}>{t(p.name)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('箭头方向')}>
              <div class="segmented arrow-directions">
                {[
                  ['none', t('无')],
                  ['forward', '→'],
                  ['backward', '←'],
                  ['both', '→ ←'],
                  ['forward-double', '→ →'],
                  ['backward-double', '← ←'],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    aria-pressed={e.arrow === id}
                    class={e.arrow === id ? 'active' : ''}
                    onClick={() =>
                      update({
                        arrow: id,
                        ...(doubleArrow(id) && !doubleArrow(e.arrow) && e.arrowAt === 0.5
                          ? {arrowAt: 0.35}
                          : {}),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            {e.arrow !== 'none' && (
              <>
                <PercentageField
                  label={t(doubleArrow(e.arrow) ? 'Arrow 1 position' : 'Arrow position')}
                  value={e.arrowAt}
                  onChange={(value) => update({arrowAt: value})}
                />
                {doubleArrow(e.arrow) && (
                  <PercentageField
                    label={t('Arrow 2 position')}
                    value={e.arrowAt2}
                    onChange={(value) => update({arrowAt2: value})}
                  />
                )}
              </>
            )}
            <Field label={t('Curve style')}>
              <select
                aria-label={t('Curve style')}
                value={e.curve}
                onChange={(ev) => update({curve: ev.currentTarget.value})}
              >
                <option value="bezier">{t('Bézier')}</option>
                <option value="ellipse">{t('Ellipse / circle')}</option>
              </select>
            </Field>
            {e.curve === 'ellipse' && (
              <PercentageField
                label={t('Ellipse ratio')}
                hint={t('100% = circle')}
                value={e.ellipseRatio}
                min={10}
                max={300}
                onChange={(value) => update({ellipseRatio: value})}
              />
            )}
            {e.from === e.to ? (
              <>
                <Field label={t('自环方向')}>
                  <select
                    aria-label={t('自环方向')}
                    value={e.loopDirection}
                    onChange={(ev) => update({loopDirection: ev.currentTarget.value})}
                  >
                    {[
                      ['top', t('上')],
                      ['right', t('右')],
                      ['bottom', t('下')],
                      ['left', t('左')],
                    ].map(([v, l]) => (
                      <option value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  label={t('自环半径')}
                  value={e.loopSize}
                  min={25}
                  max={200}
                  onChange={(v) => update({loopSize: v})}
                />
              </>
            ) : e.curve === 'ellipse' ? (
              <Field label={t('Arc side')}>
                <div class="segmented">
                  <button
                    class={e.bend >= 0 ? 'active' : ''}
                    onClick={() => update({bend: 30})}
                  >
                    {t('向左弯')}
                  </button>
                  <button
                    class={e.bend < 0 ? 'active' : ''}
                    onClick={() => update({bend: -30})}
                  >
                    {t('向右弯')}
                  </button>
                </div>
              </Field>
            ) : (
              <Field label={t('曲率')} hint={`${e.bend}°`}>
                <input
                  type="range"
                  aria-label={t('曲率')}
                  min="-90"
                  max="90"
                  step="5"
                  value={e.bend}
                  onInput={(ev) => update({bend: Number(ev.currentTarget.value)})}
                />
                <div class="range-labels">
                  <span>{t('向右弯')}</span>
                  <button onClick={() => update({bend: 0})}>{t('直线')}</button>
                  <span>{t('向左弯')}</span>
                </div>
              </Field>
            )}
            <Field label={t('标签位置')}>
              <div class="segmented">
                {[
                  ['left', t('左侧')],
                  ['center', t('Center')],
                  ['right', t('右侧')],
                ].map(([id, name]) => (
                  <button
                    class={e.labelPosition === id ? 'active' : ''}
                    onClick={() => update({labelPosition: id})}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <input
                aria-label={t('标签沿线位置')}
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={e.labelAt}
                onInput={(ev) => update({labelAt: Number(ev.currentTarget.value)})}
              />
            </Field>
            <div class="section-label">{t('动量标注')}</div>
            <Field label={t('动量')} hint="TeX">
              <input
                aria-label={t('动量')}
                placeholder={t('例如 k, p_1 - p_2')}
                value={e.momentum}
                onInput={(ev) => update({momentum: ev.currentTarget.value})}
              />
            </Field>
            <Field label={t('动量位置')}>
              <div class="segmented">
                {[
                  ['left', t('左侧')],
                  ['right', t('右侧')],
                ].map(([id, name]) => (
                  <button
                    class={e.momentumPosition === id ? 'active' : ''}
                    onClick={() => update({momentumPosition: id})}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <input
                aria-label={t('Momentum along edge')}
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={e.momentumAt}
                onInput={(ev) => update({momentumAt: Number(ev.currentTarget.value)})}
              />
            </Field>
            <NumberField
              label={t('Momentum distance')}
              value={e.momentumDistance}
              min={15}
              max={100}
              onChange={(value) => update({momentumDistance: value})}
            />
            <label class="check-field">
              <input
                type="checkbox"
                checked={e.insertion}
                onChange={(ev) => update({insertion: ev.currentTarget.checked})}
              />
              {t('反项 / 质量插入')}
            </label>
          </>
        )}
        {single && e && (
          <>
            <div class="section-label">{t('Crossings & layers')}</div>
            <div class="button-row">
              <button class="secondary-button" onClick={() => onLayer(true)}>
                {t('Bring to front')}
              </button>
              <button class="secondary-button" onClick={() => onLayer(false)}>
                {t('Send to back')}
              </button>
            </div>
            <label class="check-field">
              <input
                type="checkbox"
                checked={e.crossingGap !== false}
                onChange={(ev) => update({crossingGap: ev.currentTarget.checked})}
              />
              {t('Separation gap')}
            </label>
            <NumberField
              label={t('Gap size')}
              value={e.gapSize}
              min={4}
              max={40}
              onChange={(value) => update({gapSize: value})}
            />
            {crossingPlan(document)
              .crossings.filter((c) => c.edges.includes(e.id))
              .map((c, i) => (
                <div class="crossing-setting">
                  <span>
                    {t('Crossing')} {i + 1}
                  </span>
                  <div class="segmented">
                    <button
                      class={c.over === e.id ? 'active' : ''}
                      onClick={() => onCrossing(c, {over: e.id})}
                    >
                      {t('Over')}
                    </button>
                    <button
                      class={c.over !== e.id ? 'active' : ''}
                      onClick={() =>
                        onCrossing(c, {over: c.edges.find((id) => id !== e.id)})
                      }
                    >
                      {t('Under')}
                    </button>
                    <button
                      class={!c.enabled ? 'active' : ''}
                      onClick={() => onCrossing(c, {enabled: !c.enabled})}
                    >
                      {c.enabled ? t('No gap') : t('Enable gap')}
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}
        {single && n && (
          <>
            <Field label={t('顶点样式')}>
              <select
                aria-label={t('顶点样式')}
                value={n.vertex}
                onChange={(ev) => update({vertex: ev.currentTarget.value})}
              >
                {vertices.map((v) => (
                  <option value={v.id}>{t(v.name)}</option>
                ))}
              </select>
            </Field>
            <div class="two-columns">
              <NumberField
                label={t('X 坐标')}
                value={n.position[0]}
                onChange={(v) => update({position: [v, n.position[1]]})}
              />
              <NumberField
                label={t('Y 坐标')}
                value={n.position[1]}
                onChange={(v) => update({position: [n.position[0], v]})}
              />
            </div>
            <NumberField
              label={t('顶点大小')}
              value={n.size}
              min={2}
              max={24}
              onChange={(v) => update({size: v})}
            />
            {n.attachment && (
              <div class="attachment-status">
                <span>{t('Attached to propagator')}</span>
                <button onClick={() => update({attachment: null})}>{t('Detach')}</button>
              </div>
            )}
            <button class="secondary-button full-width" onClick={onLoop}>
              <Icon name="loop" />
              {t('添加自环')}
            </button>
          </>
        )}
        {single && a && (
          <NumberField
            label={t('字号')}
            value={a.size}
            min={12}
            max={40}
            onChange={(v) => update({size: v})}
          />
        )}
        <div class="section-label">{t('外观')}</div>
        <Field label={t('颜色')}>
          <div class="color-swatches">
            {colors.map((c) => (
              <button
                aria-label={t('颜色 {0}', c)}
                class={item?.color === c ? 'active' : ''}
                style={{background: c}}
                onClick={() => update({color: c})}
              />
            ))}
          </div>
        </Field>
        {e && (
          <NumberField
            label={t('线宽')}
            value={e?.width || 1.8}
            min={0.5}
            max={6}
            step={0.2}
            onChange={(v) => update({width: v})}
          />
        )}
        {!single && (
          <p class="fine-print">
            {t('颜色将应用到所有选中图形；线宽应用到选中的传播子。')}
          </p>
        )}
        <div class="inspector-actions">
          {e && (
            <button class="secondary-button" onClick={onReverse}>
              <Icon name="reverse" />
              {t('反转')}
            </button>
          )}
          <button class="secondary-button" onClick={onDuplicate}>
            <Icon name="copy" />
            {t('复制图形')}
          </button>
          <button class="secondary-button danger" onClick={onDelete}>
            <Icon name="trash" />
            {t('删除')}
          </button>
        </div>
      </div>
    </aside>
  )
}
