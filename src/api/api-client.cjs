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
  console.log('[apiClient][request]', {
    method: config.method,
    url: `${config.baseURL || ''}${config.url || ''}`,
    params: config.params,
    data: config.data,
  })
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    console.log('[apiClient][response]', {
      method: response.config?.method,
      url: `${response.config?.baseURL || ''}${response.config?.url || ''}`,
      status: response.status,
      data: response.data,
    })
    return response
  },
  (error) => {
    console.log('[apiClient][response:error]', {
      method: error.config?.method,
      url: `${error.config?.baseURL || ''}${error.config?.url || ''}`,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    })
    return Promise.reject(error)
  },
)

module.exports = {
  apiClient,
  API_BASE_URL,
  DEFAULT_AUTHORIZATION,
  setApiClientWindow,
}
