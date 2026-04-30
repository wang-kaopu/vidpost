const { app } = require('electron')

function getSingletonLock(getMainWindow, extractProtocolUrlFromCommandLine, handleProtocolUrl) {
    const gotSingleInstanceLock = app.requestSingleInstanceLock()
    if (!gotSingleInstanceLock) {
        app.quit()
    } else {
        app.on('second-instance', (_event, argv) => {
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
    }
}

module.exports = {
    getSingletonLock
}
