const axios = require('axios')

const API_BASE_URL = 'https://testai.reelsagent.com/api'

function createApiClient(token) {
  const normalizedToken = String(token || '').trim()
  const headers = {
    'Content-Type': 'application/json',
  }

  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`
  }

  return axios.create({
    baseURL: API_BASE_URL,
    headers,
    timeout: 30000,
  })
}

module.exports = {
  createApiClient,
  API_BASE_URL,
}
