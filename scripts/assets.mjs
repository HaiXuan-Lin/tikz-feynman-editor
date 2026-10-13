import {cp, mkdir, readFile, rm} from 'node:fs/promises'
import path from 'node:path'

export async function prepareAssets(root, output) {
  const source = path.join(root, 'node_modules/mathjax')
  const target = path.join(output, 'vendor/mathjax')
  // Rebuild this generated directory so obsolete font families never accumulate.
  await rm(target, {recursive: true, force: true})
  await mkdir(target, {recursive: true})
  const files = [
    ['unpacked/MathJax.js', 'MathJax.js'],
    ['LICENSE', 'LICENSE'],
    ['config/TeX-AMS_SVG.js', 'config/TeX-AMS_SVG.js'],
    ['jax/input/TeX', 'jax/input/TeX'],
    ['jax/element/mml', 'jax/element/mml'],
    ['jax/output/SVG/config.js', 'jax/output/SVG/config.js'],
    ['jax/output/SVG/jax.js', 'jax/output/SVG/jax.js'],
    ['jax/output/SVG/autoload', 'jax/output/SVG/autoload'],
    ['jax/output/SVG/fonts/TeX', 'jax/output/SVG/fonts/TeX'],
    ['jax/output/PreviewHTML', 'jax/output/PreviewHTML'],
    ['extensions/TeX', 'extensions/TeX'],
  ]
  for (const name of [
    'tex2jax',
    'MathEvents',
    'MathZoom',
    'MathMenu',
    'toMathML',
    'AssistiveMML',
    'fast-preview',
    'HelpDialog',
  ])
    files.push([`extensions/${name}.js`, `extensions/${name}.js`])
  files.push([
    'extensions/a11y/accessibility-menu.js',
    'extensions/a11y/accessibility-menu.js',
  ])
  for (const [from, to] of files) {
    await mkdir(path.dirname(path.join(target, to)), {recursive: true})
    await cp(path.join(source, from), path.join(target, to), {recursive: true})
  }
  for (const file of ['index.html', 'favicon.ico', 'LICENSE'])
    if (root !== output) await cp(path.join(root, file), path.join(output, file))
  for (const dir of ['css', 'img'])
    if (root !== output)
      await cp(path.join(root, dir), path.join(output, dir), {recursive: true})
  await readFile(path.join(target, 'MathJax.js'))
  await readFile(path.join(target, 'config/TeX-AMS_SVG.js'))
}
