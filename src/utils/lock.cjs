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

// 并发信号量
function createSemaphore(limit = 1) {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('createSemaphore requires a positive integer limit')
    }
    let active = 0
    const waiters = []
    function dispatch() {
        while (active < limit && waiters.length > 0) {
            const resolve = waiters.shift()
            active += 1
            resolve(releaseOnce)
        }
    }
    function releaseOnce() {
        let released = false
        return () => {
            if (released) {
                return
            }
            released = true
            active -= 1
            dispatch()
        }
    }
    async function acquire() {
        if (active < limit) {
            active += 1
            return releaseOnce()
        }
        return new Promise((resolve) => {
            waiters.push(resolve)
        })
    }
    async function withPermit(task) {
        if (typeof task !== 'function') {
            throw new Error('withPermit requires a task function')
        }
        const release = await acquire()
        try {
            return await task()
        } finally {
            release()
        }
    }
    return {
        acquire,
        withPermit,
    }
}

module.exports = {
    createSemaphore,
    getSingletonLock
}
