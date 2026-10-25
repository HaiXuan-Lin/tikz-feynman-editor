import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile, writeFile, rm, access, chmod} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import os from 'node:os'
import {writeManifest} from '../scripts/verify-app.mjs'

const helper = fileURLToPath(new URL('../scripts/macos-common.sh', import.meta.url))

async function staging(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'feynman build test '))
  t.after(() => rm(root, {recursive: true, force: true}))
  const work = path.join(root, 'temporary build')
  const output = path.join(root, 'Editor.app')
  await mkdir(path.join(work, 'new.app'), {recursive: true})
  await mkdir(output)
  await writeFile(path.join(output, 'version'), 'old')
  await writeFile(path.join(work, 'new.app/version'), 'new')
  return {root, work, output}
}

function shell(fixture, body, input = 'y\n') {
  return spawnSync(
    '/bin/bash',
    [
      '-c',
      `set -euo pipefail
source "$1"
# Stub bundle metadata for these cross-platform publication tests.
app_identifier() { printf '%s\\n' "$APP_IDENTIFIER"; }
TASK_WORK="$2"
TASK_OUTPUT="$3"
register_cleanup
${body}`,
      'build-test',
      helper,
      fixture.work,
      fixture.output,
    ],
    {input, encoding: 'utf8'},
  )
}

test('declining replacement preserves the existing app and cleans staging', async (t) => {
  const fixture = await staging(t)
  const result = shell(fixture, 'confirm_replacement "$TASK_OUTPUT" || exit 0', 'n\n')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(fixture.output, 'version'), 'utf8'), 'old')
  await assert.rejects(access(fixture.work))
})

test('successful replacement publishes the new app and removes build caches', async (t) => {
  const fixture = await staging(t)
  const result = shell(
    fixture,
    'confirm_replacement "$TASK_OUTPUT"\npublish_app "$TASK_WORK/new.app" "$TASK_OUTPUT"',
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(fixture.output, 'version'), 'utf8'), 'new')
  await assert.rejects(access(fixture.work))
})

test('failed publication rolls back and preserves the failing exit status', async (t) => {
  const fixture = await staging(t)
  const result = shell(
    fixture,
    `confirm_replacement "$TASK_OUTPUT"
task_run() {
  if [[ "$1" == mv && "$2" == "$TASK_WORK/new.app" ]]; then return 7; fi
  "$@"
}
publish_app "$TASK_WORK/new.app" "$TASK_OUTPUT"`,
  )
  assert.equal(result.status, 7, result.stderr)
  assert.equal(await readFile(path.join(fixture.output, 'version'), 'utf8'), 'old')
  await assert.rejects(access(fixture.work))
})

test('interrupted publication restores the original app and cleans staging', async (t) => {
  const fixture = await staging(t)
  const result = shell(
    fixture,
    `TASK_BACKUP="$TASK_WORK/previous.app"
mv "$TASK_OUTPUT" "$TASK_BACKUP"
mv "$TASK_WORK/new.app" "$TASK_OUTPUT"
exit 130`,
  )
  assert.equal(result.status, 130, result.stderr)
  assert.equal(await readFile(path.join(fixture.output, 'version'), 'utf8'), 'old')
  await assert.rejects(access(fixture.work))
})

test('an app appearing after the prompt is preserved without replacement approval', async (t) => {
  const fixture = await staging(t)
  const result = shell(fixture, 'publish_app "$TASK_WORK/new.app" "$TASK_OUTPUT"')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /confirm replacement/)
  assert.equal(await readFile(path.join(fixture.output, 'version'), 'utf8'), 'old')
  await assert.rejects(access(fixture.work))
})

test('packaged resource manifest detects corruption and excludes signing metadata', async (t) => {
  const fixture = await staging(t)
  const app = path.join(fixture.root, 'manifest app')
  for (const directory of ['Resources', 'MacOS', '_CodeSignature']) {
    await mkdir(path.join(app, 'Contents', directory), {recursive: true})
  }
  await writeFile(path.join(app, 'Contents/Resources/bundle.js'), 'valid resource')
  await writeFile(path.join(app, 'Contents/MacOS/Editor'), 'mutable signed executable')
  await writeFile(path.join(app, 'Contents/_CodeSignature/CodeResources'), 'signature')
  assert.equal(await writeManifest(app), 1)
  const manifest = await readFile(
    path.join(app, 'Contents/Resources/build-manifest.sha256'),
    'utf8',
  )
  assert.doesNotMatch(manifest, /MacOS|_CodeSignature/)
  const verify = () =>
    spawnSync('shasum', ['-a', '256', '-c', 'Contents/Resources/build-manifest.sha256'], {
      cwd: app,
      encoding: 'utf8',
    })
  assert.equal(verify().status, 0)
  await writeFile(path.join(app, 'Contents/Resources/bundle.js'), 'corrupted resource')
  assert.notEqual(verify().status, 0)
})

test(
  'Apple binary preparation and signing bypass Conda tools and reject corrupt Mach-O',
  {skip: process.platform !== 'darwin'},
  async (t) => {
    const fixture = await staging(t)
    const app = path.join(fixture.root, 'native application.app')
    const binary = path.join(app, 'Contents/MacOS/TikZFeynmanEditor')
    await mkdir(path.dirname(binary), {recursive: true})
    await mkdir(path.join(app, 'Contents/Resources'))
    const architecture = spawnSync('/usr/bin/uname', ['-m'], {
      encoding: 'utf8',
    }).stdout.trim()
    const compiled = spawnSync(
      '/usr/bin/xcrun',
      ['clang', '-x', 'c', '-arch', architecture, '-o', binary, '-'],
      {input: 'int main(void) { return 0; }', encoding: 'utf8'},
    )
    assert.equal(compiled.status, 0, compiled.stderr)
    await writeFile(
      path.join(app, 'Contents/Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.tikzfeynman.editor</string>
<key>CFBundleExecutable</key><string>TikZFeynmanEditor</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
    )
    await writeManifest(app)
    const shadow = path.join(fixture.root, 'conda bin')
    const trace = path.join(fixture.root, 'shadow-tool-called')
    await mkdir(shadow)
    for (const tool of [
      'strip',
      'codesign',
      'codesign_allocate',
      'plutil',
      'lipo',
      'xcrun',
    ]) {
      const file = path.join(shadow, tool)
      await writeFile(
        file,
        '#!/bin/sh\nprintf "%s\\n" "$0" > "$FEYNMAN_SHADOW_TRACE"\nexit 97\n',
      )
      await chmod(file, 0o755)
    }
    const env = {
      ...process.env,
      PATH: shadow + path.delimiter + process.env.PATH,
      CODESIGN_ALLOCATE: path.join(shadow, 'codesign_allocate'),
      FEYNMAN_SHADOW_TRACE: trace,
    }
    const result = spawnSync(
      '/bin/bash',
      [
        '-c',
        `set -euo pipefail
source "$1"
prepare_native_binary "$2/Contents/MacOS/TikZFeynmanEditor" "$(/usr/bin/uname -m)"
sign_app "$2"
verify_app "$2"
`,
        'native-tools-test',
        helper,
        app,
      ],
      {encoding: 'utf8', env},
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    await assert.rejects(access(trace), 'no shadowed tool should be invoked')
    await writeFile(binary, 'broken executable')
    const corrupt = spawnSync(
      '/bin/bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; verify_app "$2"',
        'corrupt-native-test',
        helper,
        app,
      ],
      {encoding: 'utf8', env},
    )
    assert.equal(corrupt.status, 1)
    assert.match(corrupt.stderr, /not valid Mach-O/)
  },
)
