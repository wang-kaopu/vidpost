export type MemoryAccount = {
  id: string;
  nickname?: string;
  [key: string]: unknown;
};

export type MemoryVerificationRequestStatus = "pending" | "submitted" | "cancelled" | "expired";

export type MemoryVerificationRequest = {
  requestId: string;
  platform: string;
  prompt: string;
  expiresAt: string;
  status?: MemoryVerificationRequestStatus;
  submittedCode?: string | null;
  error?: string | null;
  [key: string]: unknown;
};

export interface MemoryStore {
  getAccountById(accountId: string): Promise<MemoryAccount | null>;
  updateAccount(accountId: string, patch: Record<string, unknown>): Promise<MemoryAccount | null>;
  createRequest(input: MemoryVerificationRequest): MemoryVerificationRequest;
  getRequest(requestId: string): MemoryVerificationRequest | null;
  consumeSubmittedCode(requestId: string): string | null;
  expireRequest(requestId: string, error?: string): MemoryVerificationRequest | null;
  submitCode(requestId: string, code: string): MemoryVerificationRequest | null;
  cancelRequest(requestId: string, error?: string): MemoryVerificationRequest | null;
}

export class InMemoryStore implements MemoryStore {
  #accounts = new Map<string, MemoryAccount>();
  #requests = new Map<string, MemoryVerificationRequest>();

  async getAccountById(accountId: string): Promise<MemoryAccount | null> {
    return this.#accounts.get(accountId) ?? null;
  }

  async updateAccount(accountId: string, patch: Record<string, unknown>): Promise<MemoryAccount | null> {
    const current = this.#accounts.get(accountId) ?? { id: accountId };
    const next = { ...current, ...patch, id: accountId };
    this.#accounts.set(accountId, next);
    return next;
  }

  createRequest(input: MemoryVerificationRequest): MemoryVerificationRequest {
    const request = {
      ...input,
      status: input.status ?? "pending",
      submittedCode: input.submittedCode ?? null,
      error: input.error ?? null,
    };
    this.#requests.set(request.requestId, request);
    return request;
  }

  getRequest(requestId: string): MemoryVerificationRequest | null {
    return this.#requests.get(requestId) ?? null;
  }

  consumeSubmittedCode(requestId: string): string | null {
    const request = this.#requests.get(requestId);
    if (!request || typeof request.submittedCode !== "string" || !request.submittedCode) {
      return null;
    }

    const code = request.submittedCode;
    request.submittedCode = null;
    request.status = "submitted";
    this.#requests.set(requestId, request);
    return code;
  }

  expireRequest(requestId: string, error = "request expired"): MemoryVerificationRequest | null {
    const request = this.#requests.get(requestId);
    if (!request) {
      return null;
    }

    request.status = "expired";
    request.error = error;
    this.#requests.set(requestId, request);
    return request;
  }

  submitCode(requestId: string, code: string): MemoryVerificationRequest | null {
    const request = this.#requests.get(requestId);
    if (!request) {
      return null;
    }

    request.submittedCode = code;
    request.status = "submitted";
    this.#requests.set(requestId, request);
    return request;
  }

  cancelRequest(requestId: string, error = "request cancelled"): MemoryVerificationRequest | null {
    const request = this.#requests.get(requestId);
    if (!request) {
      return null;
    }

    request.status = "cancelled";
    request.error = error;
    this.#requests.set(requestId, request);
    return request;
  }
}

export function createMemoryStore(): MemoryStore {
  return new InMemoryStore();
}
