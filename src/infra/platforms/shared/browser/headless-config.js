/**
 * @typedef {'default' | 'probe' | 'publish:douyin' | 'publish:sohu' | 'script:baijiahao-video-state-success' | 'script:bilibili-video-state-success'} PlaywrightHeadlessScenario
 */

/**
 * Playwright 各场景的 headless 开关只允许通过这里配置。
 * 如需调整浏览器可见性，直接修改本表，不再读取环境变量。
 * @type {Record<PlaywrightHeadlessScenario, boolean>}
 */
export const PLAYWRIGHT_HEADLESS_CONFIG = {
  default: true,
  probe: true,
  'publish:douyin': true,
  'publish:sohu': true,
  'script:baijiahao-video-state-success': true,
  'script:bilibili-video-state-success': true,
};

/**
 * @param {PlaywrightHeadlessScenario | undefined} scenario
 * @returns {boolean}
 */
export function resolvePlaywrightHeadlessMode(scenario = 'default') {
  return PLAYWRIGHT_HEADLESS_CONFIG[scenario];
}
