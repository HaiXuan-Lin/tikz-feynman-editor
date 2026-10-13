import {translate} from './i18n.mjs'
import {node, edge, emptyDiagram} from './model.mjs'

function create(title, points, lines) {
  const nodes = points.map(([x, y, value = '', vertex = 'none']) =>
    node(x, y, {value, vertex}),
  )
  const edges = lines.map(([from, to, line = 'fermion', props = {}]) =>
    edge(nodes[from].id, nodes[to].id, line, props),
  )
  return {...emptyDiagram(), title: translate('en', title), nodes, edges}
}
export const templates = [
  {
    id: 'qed',
    name: '电子散射',
    category: 'QED',
    subtitle: 't-channel · photon exchange',
    create: () =>
      create(
        '电子散射',
        [
          [-240, -120, 'e^-'],
          [-40, -80, '', 'dot'],
          [-240, 120, 'e^-'],
          [-40, 80, '', 'dot'],
          [240, -120, 'e^-'],
          [240, 120, 'e^-'],
        ],
        [
          [0, 1],
          [1, 4],
          [2, 3],
          [3, 5],
          [1, 3, 'photon', {value: '\\gamma', momentum: 'q'}],
        ],
      ),
  },
  {
    id: 'annihilation',
    name: '粒子湮灭',
    category: 'QED',
    subtitle: 'e⁺e⁻ → μ⁺μ⁻',
    create: () =>
      create(
        '电子正电子湮灭',
        [
          [-240, -100, 'e^-'],
          [-240, 100, 'e^+'],
          [-80, 0, '', 'dot'],
          [80, 0, '', 'dot'],
          [240, -100, '\\mu^-'],
          [240, 100, '\\mu^+'],
        ],
        [
          [0, 2],
          [2, 1],
          [2, 3, 'photon', {value: '\\gamma'}],
          [3, 4],
          [5, 3],
        ],
      ),
  },
  {
    id: 'self-energy',
    name: '费米子自能',
    category: '圈图',
    subtitle: 'one-loop · fermion self-energy',
    create: () =>
      create(
        '费米子自能',
        [
          [-240, 0, 'p'],
          [-80, 0, '', 'dot'],
          [80, 0, '', 'dot'],
          [240, 0, 'p'],
        ],
        [
          [0, 1],
          [1, 2, 'fermion', {momentum: 'p-k', momentumPosition: 'right'}],
          [
            1,
            2,
            'photon',
            {bend: 85, value: '\\gamma', momentum: 'k', momentumPosition: 'left'},
          ],
          [2, 3],
        ],
      ),
  },
  {
    id: 'polarization',
    name: '真空极化',
    category: '圈图',
    subtitle: 'one-loop · vacuum polarization',
    create: () =>
      create(
        '真空极化',
        [
          [-240, 0, '\\gamma'],
          [-80, 0, '', 'dot'],
          [80, 0, '', 'dot'],
          [240, 0, '\\gamma'],
        ],
        [
          [0, 1, 'photon'],
          [1, 2, 'fermion', {bend: 85}],
          [2, 1, 'fermion', {bend: 85}],
          [2, 3, 'photon'],
        ],
      ),
  },
  {
    id: 'vertex',
    name: '顶点修正',
    category: '圈图',
    subtitle: 'one-loop · QED vertex',
    create: () =>
      create(
        '顶点修正',
        [
          [-240, 100, 'e^-'],
          [-100, 40, '', 'dot'],
          [0, -80, '', 'dot'],
          [100, 40, '', 'dot'],
          [240, 100, 'e^-'],
          [0, -220, '\\gamma'],
        ],
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [1, 3, 'photon', {bend: -55}],
          [2, 5, 'photon'],
        ],
      ),
  },
  {
    id: 'three-gluon',
    name: '三胶子顶点',
    category: 'QCD',
    subtitle: 'non-Abelian · three-gluon',
    create: () =>
      create(
        '三胶子顶点',
        [
          [0, 0, '', 'dot'],
          [-200, 120, 'g'],
          [200, 120, 'g'],
          [0, -200, 'g'],
        ],
        [
          [1, 0, 'gluon'],
          [0, 2, 'gluon'],
          [0, 3, 'gluon'],
        ],
      ),
  },
  {
    id: 'four-gluon',
    name: '四胶子顶点',
    category: 'QCD',
    subtitle: 'non-Abelian · four-gluon',
    create: () =>
      create(
        '四胶子顶点',
        [
          [0, 0, '', 'dot'],
          [-180, -120, 'g'],
          [-180, 120, 'g'],
          [180, -120, 'g'],
          [180, 120, 'g'],
        ],
        [
          [1, 0, 'gluon'],
          [2, 0, 'gluon'],
          [0, 3, 'gluon'],
          [0, 4, 'gluon'],
        ],
      ),
  },
  {
    id: 'quark',
    name: '夸克散射',
    category: 'QCD',
    subtitle: 'q q → q q · gluon exchange',
    create: () =>
      create(
        '夸克散射',
        [
          [-240, -120, 'q'],
          [-40, -80, '', 'dot'],
          [-240, 120, 'q'],
          [-40, 80, '', 'dot'],
          [240, -120, 'q'],
          [240, 120, 'q'],
        ],
        [
          [0, 1],
          [1, 4],
          [2, 3],
          [3, 5],
          [1, 3, 'gluon', {value: 'g'}],
        ],
      ),
  },
  {
    id: 'tadpole',
    name: 'Tadpole',
    category: '圈图',
    subtitle: 'scalar · self-loop',
    create: () =>
      create(
        '标量 Tadpole',
        [
          [-180, 0, '\\phi'],
          [0, 0, '', 'dot'],
          [180, 0, '\\phi'],
        ],
        [
          [0, 1, 'scalar'],
          [1, 2, 'scalar'],
          [1, 1, 'scalar', {loopSize: 65, value: 'k', loopDirection: 'top'}],
        ],
      ),
  },
  {
    id: 'box',
    name: 'Box diagram',
    category: '圈图',
    subtitle: 'four-point · one-loop box',
    create: () =>
      create(
        'Box diagram',
        [
          [-80, -80, '', 'dot'],
          [80, -80, '', 'dot'],
          [80, 80, '', 'dot'],
          [-80, 80, '', 'dot'],
          [-220, -160, '\\gamma'],
          [220, -160, '\\gamma'],
          [220, 160, '\\gamma'],
          [-220, 160, '\\gamma'],
        ],
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
          [4, 0, 'photon'],
          [1, 5, 'photon'],
          [2, 6, 'photon'],
          [7, 3, 'photon'],
        ],
      ),
  },
  {
    id: 'higgs',
    name: 'Higgs 衰变',
    category: '电弱',
    subtitle: 'effective vertex · H → γγ',
    create: () =>
      create(
        'Higgs 有效顶点',
        [
          [-200, 0, 'H'],
          [0, 0, '', 'blob'],
          [200, -120, '\\gamma'],
          [200, 120, '\\gamma'],
        ],
        [
          [0, 1, 'scalar'],
          [1, 2, 'photon'],
          [1, 3, 'photon'],
        ],
      ),
  },
  {
    id: 'weak',
    name: '弱衰变',
    category: '电弱',
    subtitle: 'charged current · W exchange',
    create: () =>
      create(
        '弱衰变',
        [
          [-200, 0, '\\mu^-'],
          [0, 0, '', 'dot'],
          [200, -120, '\\nu_\\mu'],
          [160, 100, '', 'dot'],
          [320, 20, 'e^-'],
          [320, 180, '\\bar\\nu_e'],
        ],
        [
          [0, 1],
          [1, 2],
          [1, 3, 'charged-boson', {value: 'W^-'}],
          [3, 4],
          [5, 3],
        ],
      ),
  },
]
export const getTemplate = (id) => templates.find((t) => t.id === id) || templates[0]
