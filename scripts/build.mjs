import * as esbuild from 'esbuild'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {prepareAssets} from './assets.mjs'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const buildOptions = {
  entryPoints: [path.join(root, 'src/index.jsx')],
  bundle: true,
  outfile: path.join(root, 'bundle.js'),
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
}
await prepareAssets(root, root)
await esbuild.build(buildOptions)
