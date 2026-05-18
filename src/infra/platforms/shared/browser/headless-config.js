/**
 * @typedef {'default' | 'probe' | 'ping:douyin' | 'ping:bilibili' | 'ping:sohu' | 'ping:baijiahao' | 'login-success:douyin' | 'login-success:bilibili' | 'login-success:sohu' | 'login-success:baijiahao' | 'publish:douyin' | 'publish:sohu' | 'publish:baijiahao' | 'record-status:douyin' | 'record-status:bilibili' | 'record-status:sohu' | 'record-status:baijiahao' | 'script:douyin-record-status' | 'script:baijiahao-video-state-success' | 'script:bilibili-video-state-success'} PlaywrightHeadlessScenario
 */

/**
 * Playwright 各场景的 headless 开关只允许通过这里配置。
 * 如需调整浏览器可见性，直接修改本表，不再读取环境变量。
 * @type {Record<PlaywrightHeadlessScenario, boolean>}
 */
export const PLAYWRIGHT_HEADLESS_CONFIG = {
  default: false,
  probe: false,
  'ping:douyin': true,
  'ping:bilibili': true,
  'ping:sohu': true,
  'ping:baijiahao': true,
  'login-success:douyin': true,
  'login-success:bilibili': true,
  'login-success:sohu': true,
  'login-success:baijiahao': true,
  'publish:douyin': false,
  'publish:sohu': false,
  'publish:baijiahao': false,
  'record-status:douyin': true,
  'record-status:bilibili': true,
  'record-status:sohu': true,
  'record-status:baijiahao': true,
  'script:douyin-record-status': false,
  'script:baijiahao-video-state-success': false,
  'script:bilibili-video-state-success': false,
};

/**
 * @param {PlaywrightHeadlessScenario | undefined} scenario
 * @returns {boolean}
 */
export function resolvePlaywrightHeadlessMode(scenario = 'default') {
  return PLAYWRIGHT_HEADLESS_CONFIG[scenario];
}
