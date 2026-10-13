import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises'
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
# Stub the macOS-only plist reader; filesystem operations remain real.
plutil() { printf '%s\\n' "$APP_IDENTIFIER"; }
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
