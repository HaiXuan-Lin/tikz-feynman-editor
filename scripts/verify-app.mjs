import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile, readdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Script} from 'node:vm'

export async function verifyResources(app) {
  const resources = path.join(app, 'Contents/Resources')
  const html = await readFile(path.join(resources, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  for (const ref of refs) {
    assert.ok(ref.startsWith('./'), `Entry page requires an external resource: ${ref}`)
    const relative = ref.split(/[?#]/)[0]
    const asset = path.resolve(resources, relative)
    assert.ok(asset.startsWith(resources + path.sep), `Invalid asset path: ${ref}`)
    assert.ok((await readFile(asset)).length, `Empty asset: ${ref}`)
  }
  const bundle = await readFile(path.join(resources, 'bundle.js'), 'utf8')
  new Script(bundle, {filename: 'bundle.js'})
  for (const asset of [
    'img/app-icon.svg',
    'AppIcon.icns',
    'LICENSE',
    'vendor/mathjax/config/TeX-AMS_SVG.js',
    'vendor/mathjax/jax/input/TeX/config.js',
    'vendor/mathjax/jax/output/SVG/jax.js',
    'vendor/mathjax/jax/output/SVG/fonts/TeX/Main/Regular/Main.js',
  ]) {
    assert.ok((await readFile(path.join(resources, asset))).length, `Missing ${asset}`)
  }
}

export async function writeManifest(app) {
  const manifest = 'Contents/Resources/build-manifest.sha256'
  const files = []
  async function walk(directory) {
    for (const entry of await readdir(path.join(app, directory), {withFileTypes: true})) {
      const relative = path.posix.join(directory, entry.name)
      // Native executables are checked by codesign: signing mutates Mach-O files.
      if (
        relative === manifest ||
        relative === 'Contents/MacOS' ||
        entry.name === '_CodeSignature'
      )
        continue
      if (entry.isDirectory()) await walk(relative)
      else {
        assert.ok(entry.isFile(), `Unexpected symbolic link or special file: ${relative}`)
        files.push(relative)
      }
    }
  }
  await walk('Contents')
  const lines = []
  for (const file of files.sort()) {
    const checksum = createHash('sha256')
      .update(await readFile(path.join(app, file)))
      .digest('hex')
    lines.push(`${checksum}  ${file}`)
  }
  await writeFile(path.join(app, manifest), lines.join('\n') + '\n')
  return files.length
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], 'Usage: node scripts/verify-app.mjs APP_PATH')
  const app = path.resolve(process.argv[2])
  await verifyResources(app)
  const count = await writeManifest(app)
  console.log(
    `Compiled JavaScript, offline resources and ${count} packaged files verified.`,
  )
}
