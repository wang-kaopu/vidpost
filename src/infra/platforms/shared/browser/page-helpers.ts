import type { ElementHandle, FileChooser, Frame, Locator, Page } from "playwright";

import { PlatformTimeoutError } from "../errors.ts";

export const DEFAULT_POLL_INTERVAL_MS = 200;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function listScopeCandidates(page: Page): Array<Page | Frame> {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

export async function waitForCondition(
  platform: string,
  step: string,
  timeoutMs: number,
  predicate: () => Promise<boolean> | boolean,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new PlatformTimeoutError(platform, step, timeoutMs);
}

export async function clickIfVisible(target: Locator, timeoutMs = 1_000): Promise<boolean> {
  try {
    if (!(await target.isVisible({ timeout: timeoutMs }))) {
      return false;
    }
    await target.click({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function fillIfVisible(target: Locator, value: string, timeoutMs = 1_000): Promise<boolean> {
  try {
    if (!(await target.isVisible({ timeout: timeoutMs }))) {
      return false;
    }
    await target.fill(value, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function pickFileWithChooser(
  page: Page,
  trigger: () => Promise<unknown>,
  filePath: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    const chooserPromise = page.waitForEvent("filechooser", { timeout: timeoutMs });
    await trigger();
    const chooser = (await chooserPromise) as FileChooser;
    await chooser.setFiles(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function setInputFilesIfVisible(target: Locator, filePath: string, timeoutMs = 1_000): Promise<boolean> {
  try {
    if (!(await target.isVisible({ timeout: timeoutMs }))) {
      return false;
    }
    await target.setInputFiles(filePath, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function firstVisibleLocator(page: Page, selectors: readonly string[], timeoutMs = 1_000): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: timeoutMs })) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function firstVisibleLocatorAcrossScopes(page: Page, selectors: readonly string[], timeoutMs = 1_000): Promise<Locator | null> {
  for (const scope of listScopeCandidates(page)) {
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        try {
          if (await candidate.isVisible({ timeout: timeoutMs })) {
            return candidate;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

export async function clickWithDomFallback(target: Locator, options?: { timeoutMs?: number; force?: boolean }): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const force = options?.force ?? true;

  try {
    await target.click({ timeout: timeoutMs, force });
    return true;
  } catch {
    const handle = await target.elementHandle().catch(() => null);
    if (!handle) {
      return false;
    }
    return domClickHandle(handle);
  }
}

export async function domClickHandle(handle: ElementHandle): Promise<boolean> {
  return handle
    .evaluate((node) => {
      try {
        (node as HTMLElement).click();
        return true;
      } catch {
        return false;
      }
    })
    .catch(() => false);
}

export async function findFileInput(
  page: Page,
  selectors: readonly string[],
  log?: (message: string) => void,
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    log?.(`probe selector=${selector} count=${count}`);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const accept = await candidate.getAttribute("accept").catch(() => "");
      const className = await candidate.getAttribute("class").catch(() => "");
      const type = await candidate.getAttribute("type").catch(() => "");
      log?.(`input candidate index=${index} type=${type} class=${className} accept=${accept}`);
      if (String(type || "").toLowerCase() !== "file") {
        continue;
      }
      if (!accept || /image|png|jpg|jpeg|gif/i.test(accept)) {
        return candidate;
      }
    }
  }
  return null;
}

export async function findFileInputAcrossScopes(
  page: Page,
  selectors: readonly string[],
  log?: (message: string) => void,
): Promise<Locator | null> {
  for (const scope of listScopeCandidates(page)) {
    const scopeLabel = "url" in scope ? String(scope.url() || "") : "";
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = await locator.count().catch(() => 0);
      log?.(`scope=${scopeLabel} probe selector=${selector} count=${count}`);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const accept = await candidate.getAttribute("accept").catch(() => "");
        const className = await candidate.getAttribute("class").catch(() => "");
        const type = await candidate.getAttribute("type").catch(() => "");
        log?.(`scope=${scopeLabel} input candidate index=${index} type=${type} class=${className} accept=${accept}`);
        if (String(type || "").toLowerCase() !== "file") {
          continue;
        }
        if (!accept || /image|png|jpg|jpeg|gif/i.test(accept)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

export async function retryTriggerUntil(
  page: Page,
  selectors: readonly string[],
  predicate: () => Promise<boolean>,
  options?: {
    attempts?: number;
    intervalMs?: number;
    logPrefix?: string;
  },
): Promise<boolean> {
  const attempts = options?.attempts ?? 3;
  const intervalMs = options?.intervalMs ?? 1_000;
  const logPrefix = options?.logPrefix ?? "trigger";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const target = await firstVisibleLocator(page, selectors);
    if (!target) {
      console.log(`[${logPrefix}] attempt=${attempt} no trigger found`);
      if (attempt < attempts) {
        await page.waitForTimeout(intervalMs);
      }
      continue;
    }

    const tag = await target.evaluate((node) => node.tagName).catch(() => "");
    const className = await target.getAttribute("class").catch(() => "");
    const text = await target.innerText().catch(() => "");
    console.log(`[${logPrefix}] attempt=${attempt} tag=${tag} class=${className} text=${String(text || "").replace(/\s+/g, " ").slice(0, 120)}`);

    const clicked = await clickWithDomFallback(target, { timeoutMs: 5_000, force: true });
    console.log(`[${logPrefix}] attempt=${attempt} clicked=${clicked}`);

    await page.waitForTimeout(intervalMs);
    const ok = await predicate();
    console.log(`[${logPrefix}] attempt=${attempt} predicate=${ok}`);
    if (ok) {
      return true;
    }
  }

  return false;
}
