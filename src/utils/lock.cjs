const { app } = require('electron')

function attachSingletonLock(appInstance, getMainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl) {
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

function getSingletonLock(getMainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl) {
    return attachSingletonLock(app, getMainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl)
}

module.exports = {
    attachSingletonLock,
    getSingletonLock
}
