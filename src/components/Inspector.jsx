import {useI18n} from './I18n'
import {h, Fragment} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import {propagators, vertices, colors, lineStyle, doubleArrow} from '../core/catalog.mjs'
import {
  TEX_POINTS_PER_UNIT,
  lineWidth,
  vertexRadius,
  momentumDistance,
  arrowPositions,
} from '../core/styles.mjs'
import {selected} from '../core/model.mjs'
import {crossingPlan, normalizeAngle} from '../core/geometry.mjs'
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
function NumberField({label, value, onChange, min, max, step = 1, placeholder}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="number"
        placeholder={placeholder}
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
function InheritedNumberField({label, value, fallback, onChange, min, max, step = 0.1}) {
  const t = useI18n()
  return (
    <div class="inherited-number-field">
      <label class="check-field">
        <input
          type="checkbox"
          aria-label={label + ' · ' + t('TikZ-Feynman default')}
          checked={value == null}
          onChange={(e) => onChange(e.currentTarget.checked ? null : fallback)}
        />
        {t('TikZ-Feynman default')}
      </label>
      <NumberField
        label={label}
        value={value == null ? '' : value}
        placeholder={String(Number(fallback.toFixed(3)))}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </div>
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
const directions = [
  [135, '↖'],
  [90, '↑'],
  [45, '↗'],
  [180, '←'],
  null,
  [0, '→'],
  [-135, '↙'],
  [-90, '↓'],
  [-45, '↘'],
]
function LoopControls({edge: e, update, onAutoLoop}) {
  const t = useI18n()
  const angle = Math.round(e.loopAngle)
  const [draft, setDraft] = useState(String(angle))
  useEffect(() => setDraft(String(angle)), [angle])
  const commitDraft = (ev) => {
    const value = Number(ev.currentTarget.value)
    if (ev.currentTarget.value.trim() && Number.isFinite(value))
      update({loopAngle: normalizeAngle(value)})
    else setDraft(String(angle))
  }
  return (
    <>
      <div class="section-label">{t('Self-loop')}</div>
      <Field label={t('Loop direction')} hint={t('0° = right · 90° = up')}>
        <div class="loop-direction">
          <div class="direction-pad" role="group" aria-label={t('Loop direction')}>
            {directions.map((d) =>
              d ? (
                <button
                  type="button"
                  class={
                    Math.abs(normalizeAngle(e.loopAngle - d[0])) < 0.5 ? 'active' : ''
                  }
                  aria-label={`${d[0]}°`}
                  onClick={() => update({loopAngle: d[0]})}
                >
                  {d[1]}
                </button>
              ) : (
                <button
                  type="button"
                  class="auto"
                  title={t('Point into the widest free gap')}
                  onClick={onAutoLoop}
                >
                  {t('Auto')}
                </button>
              ),
            )}
          </div>
          <div class="angle-control">
            <input
              type="range"
              aria-label={t('Loop direction')}
              min="-180"
              max="180"
              step="1"
              value={angle}
              onInput={(ev) =>
                update({loopAngle: normalizeAngle(Number(ev.currentTarget.value))})
              }
            />
            <label class="angle-number">
              <input
                aria-label={`${t('Loop direction')} (°)`}
                type="number"
                step="1"
                value={draft}
                onInput={(ev) => setDraft(ev.currentTarget.value)}
                onBlur={commitDraft}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') ev.currentTarget.blur()
                }}
              />
              <span>°</span>
            </label>
          </div>
        </div>
      </Field>
      <Field label={t('Orientation')}>
        <div class="segmented">
          <button
            class={e.loopClockwise ? 'active' : ''}
            onClick={() => !e.loopClockwise && update({loopClockwise: true})}
          >
            ↻ {t('Clockwise')}
          </button>
          <button
            class={e.loopClockwise ? '' : 'active'}
            onClick={() => e.loopClockwise && update({loopClockwise: false})}
          >
            ↺ {t('Counter-clockwise')}
          </button>
        </div>
      </Field>
      <Field label={t('Loop shape')}>
        <div class="segmented">
          <button
            class={e.curve === 'ellipse' ? 'active' : ''}
            onClick={() => update({curve: 'ellipse'})}
          >
            {t('Circle')}
          </button>
          <button
            class={e.curve === 'ellipse' ? '' : 'active'}
            onClick={() => update({curve: 'bezier'})}
          >
            {t('TikZ loop')}
          </button>
        </div>
      </Field>
      <Field label={t('Loop size')} hint={`${e.loopSize}`}>
        <input
          type="range"
          aria-label={t('Loop size')}
          min="25"
          max="200"
          step="1"
          value={e.loopSize}
          onInput={(ev) => update({loopSize: Number(ev.currentTarget.value)})}
        />
      </Field>
      {e.curve === 'ellipse' ? (
        <PercentageField
          label={t('Ellipse ratio')}
          hint={t('100% = circle')}
          value={e.ellipseRatio}
          min={10}
          max={300}
          onChange={(value) => update({ellipseRatio: value})}
        />
      ) : (
        <Field label={t('Opening')} hint={`±${e.loopSpread}°`}>
          <input
            type="range"
            aria-label={t('Opening')}
            min="15"
            max="75"
            step="1"
            value={e.loopSpread}
            onInput={(ev) => update({loopSpread: Number(ev.currentTarget.value)})}
          />
        </Field>
      )}
      <p class="fine-print">
        {t('Drag the round handle on the canvas to turn the loop.')}
      </p>
    </>
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
  onAutoLoop,
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
  // Like quiver's side panel, the inspector slides away when nothing is selected.
  if (!selection.length)
    return <aside class="panel inspector-panel hidden" aria-hidden="true" />
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
        {single && e && (
          <>
            <Field label={t('传播子类型')}>
              <div class="propagator-picker">
                {propagators.map((p) => (
                  <button
                    type="button"
                    data-line={p.id}
                    class={e.line === p.id ? 'active' : ''}
                    aria-pressed={e.line === p.id}
                    aria-label={t(p.name)}
                    title={t(p.description)}
                    onClick={() =>
                      update({
                        line: p.id,
                        arrow: p.arrow,
                        arrowAt: arrowPositions(p.id, p.arrow)[0],
                        arrowAt2: arrowPositions(p.id, p.arrow)[1],
                      })
                    }
                  >
                    <LinePreview line={p.id} />
                    <span>{t(p.name)}</span>
                  </button>
                ))}
              </div>
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
            {e.from === e.to ? (
              <LoopControls edge={e} update={update} onAutoLoop={onAutoLoop} />
            ) : (
              <>
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
              </>
            )}
            {e.from === e.to ? null : e.curve === 'ellipse' ? (
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
            <InheritedNumberField
              label={t('Momentum distance') + ' (mm)'}
              value={e.momentumDistance == null ? null : e.momentumDistance / 8}
              fallback={momentumDistance({...e, momentumDistance: null}) / 8}
              min={0}
              max={12.5}
              onChange={(v) => update({momentumDistance: v == null ? null : v * 8})}
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
            <InheritedNumberField
              label={t('顶点大小') + ' (mm)'}
              value={n.size == null ? null : vertexRadius(n) / 4}
              fallback={vertexRadius({...n, size: null}) / 4}
              min={0.1}
              max={30}
              onChange={(v) =>
                update({
                  size: v == null ? null : (v * 4) / (n.vertex === 'blob' ? 2.7 : 1),
                })
              }
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
          <button class="secondary-button" onClick={() => update({color: null})}>
            {t('TikZ-Feynman default')}
          </button>
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
          <InheritedNumberField
            label={t('线宽') + ' (pt)'}
            value={
              e.width == null ? null : Number((e.width * TEX_POINTS_PER_UNIT).toFixed(3))
            }
            fallback={Number(
              (lineWidth({...e, width: null}) * TEX_POINTS_PER_UNIT).toFixed(3),
            )}
            min={0.1}
            max={6}
            step={0.05}
            onChange={(v) => update({width: v == null ? null : v / TEX_POINTS_PER_UNIT})}
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
