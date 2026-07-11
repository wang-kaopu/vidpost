import axios, { AxiosHeaders } from 'axios'
import type { BrowserWindow } from 'electron'

import { logger } from '../utils/logger.ts'

const API_BASE_URL = 'https://testai.reelsagent.com/api'
const DEFAULT_AUTHORIZATION = '6c4ff3a4df0cdeb07ed4d2ea0fd3db69'

let mainWindow: BrowserWindow | null = null

export function setApiClientWindow(window: BrowserWindow): void {
  mainWindow = window
}

async function getAccessToken() {
  if (!mainWindow) {
    return DEFAULT_AUTHORIZATION
  }
  try {
    const accessToken = await mainWindow.webContents.executeJavaScript(
      `window.localStorage.getItem('access_token')`,
      true,
    )
    return accessToken ? `Bearer ${accessToken}` : DEFAULT_AUTHORIZATION
  } catch (error) {
    logger.error('Failed to retrieve access token from renderer process:', error)
    return DEFAULT_AUTHORIZATION
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

apiClient.interceptors.request.use(async (config) => {
  const accessToken = await getAccessToken()
  config.headers = AxiosHeaders.from(config.headers)
  config.headers.Authorization = accessToken
  logger.info('[apiClient][request]', {
    method: config.method,
    url: `${config.baseURL || ''}${config.url || ''}`,
    params: config.params,
    data: config.data,
  })
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    logger.info('[apiClient][response]', {
      method: response.config?.method,
      url: `${response.config?.baseURL || ''}${response.config?.url || ''}`,
      status: response.status,
      data: response.data,
    })
    return response
  },
  (error) => {
    logger.error('[apiClient][response:error]', {
      method: error.config?.method,
      url: `${error.config?.baseURL || ''}${error.config?.url || ''}`,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    })
    return Promise.reject(error)
  },
)

export { API_BASE_URL, DEFAULT_AUTHORIZATION }
