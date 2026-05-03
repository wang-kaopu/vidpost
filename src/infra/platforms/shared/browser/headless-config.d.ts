export type PlaywrightHeadlessScenario =
  | "default"
  | "probe"
  | "publish:douyin"
  | "publish:sohu"
  | "script:baijiahao-video-state-success"
  | "script:bilibili-video-state-success";

export declare const PLAYWRIGHT_HEADLESS_CONFIG: Record<PlaywrightHeadlessScenario, boolean>;
export declare function resolvePlaywrightHeadlessMode(scenario?: PlaywrightHeadlessScenario): boolean;
