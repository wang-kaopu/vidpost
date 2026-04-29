const axios = require('axios')

const API_BASE_URL = 'https://testai.reelsagent.com/api'
const DEFAULT_AUTHORIZATION = '6c4ff3a4df0cdeb07ed4d2ea0fd3db69'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: DEFAULT_AUTHORIZATION,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

module.exports = {
  apiClient,
  API_BASE_URL,
  DEFAULT_AUTHORIZATION,
}
