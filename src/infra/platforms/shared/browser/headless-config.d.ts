export type PlaywrightHeadlessScenario =
  | "default"
  | "probe"
  | "ping:douyin"
  | "ping:bilibili"
  | "ping:sohu"
  | "ping:baijiahao"
  | "login-success:douyin"
  | "login-success:bilibili"
  | "login-success:sohu"
  | "login-success:baijiahao"
  | "publish:douyin"
  | "publish:sohu"
  | "publish:baijiahao"
  | "record-status:douyin"
  | "record-status:bilibili"
  | "record-status:sohu"
  | "record-status:baijiahao"
  | "script:douyin-record-status"
  | "script:baijiahao-video-state-success"
  | "script:bilibili-video-state-success";

export declare const PLAYWRIGHT_HEADLESS_CONFIG: Record<PlaywrightHeadlessScenario, boolean>;
export declare function resolvePlaywrightHeadlessMode(scenario?: PlaywrightHeadlessScenario): boolean;
