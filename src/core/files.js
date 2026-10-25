export async function copyText(text) {
  if (window.webkit?.messageHandlers?.clipboard) {
    window.webkit.messageHandlers.clipboard.postMessage(text)
    return
  }
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (_) {
      /* fall back to selection */
    }
  }
  const field = document.createElement('textarea')
  field.value = text
  field.style.cssText = 'position:fixed;top:-9999px;'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('复制失败，请从导出面板手动复制。')
}

export function download(name, content, mime) {
  if (window.webkit?.messageHandlers?.download) {
    window.webkit.messageHandlers.download.postMessage({name, content, mime})
    return
  }
  const url = URL.createObjectURL(new Blob([content], {type: mime}))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function pickProject() {
  if (window.webkit?.messageHandlers?.openProject) {
    window.webkit.messageHandlers.openProject.postMessage('open')
    return null
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.feynman,application/json'
    input.addEventListener('change', async () => {
      try {
        resolve(input.files[0] ? await input.files[0].text() : null)
      } catch (error) {
        reject(error)
      }
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export function svgDocument(scene, box, title, background = true) {
  const content = scene.getBBox()
  const left = Math.min(box.x, content.x - 20),
    top = Math.min(box.y, content.y - 20)
  const right = Math.max(box.x + box.width, content.x + content.width + 20),
    bottom = Math.max(box.y + box.height, content.y + content.height + 20)
  box = {x: left, y: top, width: right - left, height: bottom - top}
  const clone = scene.cloneNode(true)
  clone
    .querySelectorAll(
      '.hit-target,.selection-halo,.hover-halo,.node-handle,.edge-handle,.draft',
    )
    .forEach((el) => el.remove())
  clone.querySelectorAll('[tabindex],[role],[data-kind],[data-id]').forEach((el) => {
    for (const attr of ['tabindex', 'role', 'data-kind', 'data-id', 'aria-label'])
      el.removeAttribute(attr)
  })
  const escape = (value) =>
    value.replace(/[<>&]/g, (c) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;'})[c])
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" width="${box.width}" height="${box.height}"><title>${escape(title)}</title>${background ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="white"/>` : ''}${clone.innerHTML}</svg>`
}
