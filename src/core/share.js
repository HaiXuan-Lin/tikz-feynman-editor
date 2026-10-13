import LZString from 'lz-string'
import {parseDiagram} from './model.mjs'

export const encode = (document) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(document))
export function decode(hash) {
  const compressed = LZString.decompressFromEncodedURIComponent(hash)
  if (compressed) return parseDiagram(compressed)
  const bytes = atob(hash)
  return parseDiagram(
    decodeURIComponent(
      [...bytes].map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    ),
  )
}
export function shareURL(document) {
  if (window.location.protocol === 'file:') return `feynman:v2:${encode(document)}`
  const base = window.location.href.split('#')[0]
  return `${base}#${encode(document)}`
}
