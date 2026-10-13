import * as esbuild from 'esbuild'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {prepareAssets} from './assets.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await prepareAssets(root, root)
const context = await esbuild.context({
  entryPoints: [path.join(root, 'src/index.jsx')],
  bundle: true,
  outfile: path.join(root, 'bundle.js'),
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info',
})
await context.watch()
const server = await context.serve({servedir: root, host: '127.0.0.1', port: 8000})
console.log(`Editor: http://127.0.0.1:${server.port}`)
