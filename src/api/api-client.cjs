const axios = require('axios')

const API_BASE_URL = 'https://testai.reelsagent.com/api'
const DEFAULT_AUTHORIZATION = '6c4ff3a4df0cdeb07ed4d2ea0fd3db69'

let mainWindow = null

function setApiClientWindow(window) {
  mainWindow = window
}

async function getAccessToken() {
  try {
    const accessToken = await mainWindow.webContents.executeJavaScript(
      `window.localStorage.getItem('access_token')`,
      true,
    )
    return accessToken ? `Bearer ${accessToken}` : DEFAULT_AUTHORIZATION
  } catch (error) {
    console.error('Failed to retrieve access token from renderer process:', error)
    return DEFAULT_AUTHORIZATION
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

apiClient.interceptors.request.use(async (config) => {
  const accessToken = await getAccessToken()
  config.headers = config.headers || {}
  config.headers.Authorization = accessToken
  return config
})

module.exports = {
  apiClient,
  API_BASE_URL,
  DEFAULT_AUTHORIZATION,
  setApiClientWindow,
}
