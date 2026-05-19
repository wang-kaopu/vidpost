const RENDERER_MARKER = '<meta name="agenthunt-renderer" content="rm-server"'

async function shouldUseDevServer(devServerUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(devServerUrl, {
      signal: AbortSignal.timeout(800),
    })
    if (!response.ok) {
      return false
    }
    const html = await response.text()
    return html.includes(RENDERER_MARKER)
  } catch (error) {
    return false
  }
}

async function loadRenderer(window, { devServerUrl, builtAppPath, isPackaged, fetchImpl = fetch }) {
  if (isPackaged) {
    await window.loadFile(builtAppPath)
    return
  }

  if (await shouldUseDevServer(devServerUrl, fetchImpl)) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadFile(builtAppPath)
}

module.exports = {
  RENDERER_MARKER,
  loadRenderer,
  shouldUseDevServer,
}
