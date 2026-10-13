import './build.mjs'
import {mkdir, cp} from 'node:fs/promises'
import path from 'node:path'
import {root} from './build.mjs'

const output = path.join(root, 'dist/tikz-feynman-editor')
await mkdir(output, {recursive: true})
for (const file of ['index.html', 'bundle.js', 'favicon.ico', 'LICENSE'])
  await cp(path.join(root, file), path.join(output, file))
for (const directory of ['css', 'img', 'vendor'])
  await cp(path.join(root, directory), path.join(output, directory), {recursive: true})
console.log(`Standalone web application: ${output}`)
