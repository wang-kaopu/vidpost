import type { App, BrowserWindow } from 'electron'

type MainWindowGetter = () => BrowserWindow | null
type ProtocolUrlExtractor = (argv: readonly string[]) => string | null
type ProtocolUrlHandler = (url: string) => void

export function attachSingletonLock(
    appInstance: App,
    getMainWindow: MainWindowGetter,
    extractProtocolUrlFromCommandLine: ProtocolUrlExtractor,
    handleProtocolUrl: ProtocolUrlHandler,
): boolean {
    const gotSingleInstanceLock = appInstance.requestSingleInstanceLock()
    if (!gotSingleInstanceLock) {
        appInstance.quit()
        return false
    }

    appInstance.on('second-instance', (_event, argv) => {
        const deepLinkUrl = extractProtocolUrlFromCommandLine(argv)
        if (deepLinkUrl) {
            handleProtocolUrl(deepLinkUrl)
            return
        }
        const mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null
        if (!mainWindow) {
            return
        }
        if (mainWindow.isDestroyed()) {
            return
        }
        if (mainWindow.isMinimized()) {
            mainWindow.restore()
        }
        mainWindow.focus()
    })

    return true
}

export function getSingletonLock(
    appInstance: App,
    getMainWindow: MainWindowGetter,
    extractProtocolUrlFromCommandLine: ProtocolUrlExtractor,
    handleProtocolUrl: ProtocolUrlHandler,
): boolean {
    return attachSingletonLock(appInstance, getMainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl)
}
