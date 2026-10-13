export const GRID = 80
export const INK = '#282a30'
export const arrowStyles = [
  'none',
  'forward',
  'backward',
  'both',
  'forward-double',
  'backward-double',
]
export const doubleArrow = (style) =>
  ['both', 'forward-double', 'backward-double'].includes(style)

export const propagators = [
  {
    id: 'fermion',
    name: '费米子',
    symbol: 'f',
    description: '有向实线',
    arrow: 'forward',
    tex: 'fermion',
  },
  {
    id: 'antifermion',
    name: '反费米子',
    symbol: 'f̄',
    description: '反向实线',
    arrow: 'backward',
    tex: 'anti fermion',
  },
  {
    id: 'photon',
    name: '光子 / 玻色子',
    symbol: 'γ',
    description: '波浪线',
    arrow: 'none',
    tex: 'photon',
  },
  {
    id: 'gluon',
    name: '胶子',
    symbol: 'g',
    description: '螺旋线',
    arrow: 'none',
    tex: 'gluon',
  },
  {
    id: 'scalar',
    name: '标量',
    symbol: 'φ',
    description: '虚线',
    arrow: 'none',
    tex: 'scalar',
  },
  {
    id: 'charged-scalar',
    name: '带电标量',
    symbol: 'φ±',
    description: '有向虚线',
    arrow: 'forward',
    tex: 'charged scalar',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    symbol: 'c',
    description: '有向点线',
    arrow: 'forward',
    tex: 'ghost',
  },
  {
    id: 'majorana',
    name: 'Majorana',
    symbol: 'χ',
    description: '相向箭头',
    arrow: 'both',
    tex: 'majorana',
  },
  {
    id: 'charged-boson',
    name: '带电玻色子',
    symbol: 'W',
    description: '有向波浪线',
    arrow: 'forward',
    tex: 'charged boson',
  },
  {
    id: 'double',
    name: '双线',
    symbol: '≋',
    description: '复合传播子',
    arrow: 'none',
    tex: 'plain, double',
  },
  {
    id: 'graviton',
    name: '引力子',
    symbol: 'G',
    description: '双波浪线',
    arrow: 'none',
    tex: 'photon, double',
  },
  {
    id: 'plain',
    name: '普通实线',
    symbol: '—',
    description: '无箭头实线',
    arrow: 'none',
    tex: 'plain',
  },
]
export const vertices = [
  {id: 'none', name: '无标记'},
  {id: 'dot', name: '实心顶点'},
  {id: 'empty_dot', name: '空心顶点'},
  {id: 'square_dot', name: '方形顶点'},
  {id: 'crossed_dot', name: '反项顶点'},
  {id: 'blob', name: '有效顶点'},
]
export const colors = ['#282a30', '#5674bd', '#bc5557', '#4b8a70', '#9975b4', '#c28b42']
export const lineStyle = (id) =>
  propagators.find((item) => item.id === id) || propagators[0]
