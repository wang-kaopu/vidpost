export const AGENTHUNT_PROTOCOL = "agenthunt";
export const AGENTHUNT_NAVIGATE_HOST = "navigate";
export const AGENTHUNT_LAUNCH_INTENT_EVENT = "agenthunt:launch-intent";
export const AGENTHUNT_GET_LAUNCH_INTENT_CHANNEL = "agenthunt:get-launch-intent";

export type LaunchIntent = {
  page: "accounts" | "works";
};

export type ProtocolClientRegistration = {
  path?: string;
  args?: string[];
};

const PAGE_BY_PATHNAME: Record<string, LaunchIntent["page"]> = {
  "/accounts": "accounts",
  "/works": "works",
};

function stripWrappingQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "");
}

function normalizePathname(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") || "/" : trimmed;
}

export function parseAgenthuntUrl(rawUrl: string): LaunchIntent | null {
  const candidate = stripWrappingQuotes(String(rawUrl || "").trim());
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== `${AGENTHUNT_PROTOCOL}:`) {
      return null;
    }
    if (parsed.hostname !== AGENTHUNT_NAVIGATE_HOST) {
      return null;
    }

    const page = PAGE_BY_PATHNAME[normalizePathname(parsed.pathname)];
    if (!page) {
      return null;
    }

    return { page };
  } catch {
    return null;
  }
}

export function extractProtocolUrlFromCommandLine(argv: readonly string[], protocol = AGENTHUNT_PROTOCOL): string | null {
  const prefix = `${protocol.toLowerCase()}://`;

  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const candidate = stripWrappingQuotes(String(argv[index] || "").trim());
    if (!candidate) {
      continue;
    }
    if (candidate.toLowerCase().startsWith(prefix)) {
      return candidate;
    }
  }

  return null;
}

export function resolveProtocolClientRegistration(
  argv: readonly string[],
  defaultApp: boolean,
): ProtocolClientRegistration | null {
  if (!defaultApp) {
    return {};
  }

  const entrypoint = String(argv[1] || "").trim();
  if (!entrypoint) {
    return null;
  }

  return {
    args: [entrypoint],
  };
}
