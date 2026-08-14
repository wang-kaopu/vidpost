import fs from "node:fs";
import path from "node:path";

import {
  PLATFORMS,
  type LocalPublishRecordDTO,
  type Platform,
  type PublishInput,
  type PublishRecordListInput,
} from "@shared/electron-api.ts";
import { validateScheduledAt } from "@shared/publish-schedule.ts";

export const CLI_VERSION = 1;

export type CliCommand = "login" | "publish" | "records";
export type CliExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CliArguments =
  | { command: "login"; platform: Platform }
  | { command: "publish"; requestPath: string }
  | { command: "records"; queryPath?: string };

export interface CliRequest {
  version: 1;
  task: CliTask;
}

export interface CliTask {
  accountId: number | string;
  accountName: string;
  channelId?: number;
  coverPath: string;
  humanTypeId?: number;
  introduction: string;
  platform: Platform;
  progressId: string;
  scheduledAt: string;
  title: string;
  videoChannelId?: number;
  videoPath: string;
  visibility?: "friends" | "public" | "self";
}

type CliRecord = Omit<LocalPublishRecordDTO, "videoPath" | "coverPath">;

export interface CliEvent {
  version: 1;
  type: "error" | "progress" | "ready" | "result";
  command?: CliCommand;
  errorCode?: CliExitCode;
  link?: string;
  localRecordId?: number;
  message?: string;
  nickname?: string;
  phase?: "preparing" | "publishing";
  pid?: number;
  platformWorkId?: string | null;
  records?: CliRecord[];
  status?: string;
  taskId?: string;
  accountId?: string;
  updatedExistingAccount?: boolean;
}

export interface CliRunOptions {
  /** 返回 true 表示 CLI 已收到终止信号，后续不再输出成功或失败结果。 */
  isCancelled?: () => boolean;
}

interface CliArgumentParseOptions {
  /** 开发环境 argv 会额外包含 Electron 可执行文件和应用目录。 */
  defaultApp?: boolean;
}

const ALLOWED_REQUEST_FIELDS = new Set(["version", "task"]);
const ALLOWED_TASK_FIELDS = new Set([
  "accountId",
  "accountName",
  "channelId",
  "coverPath",
  "humanTypeId",
  "introduction",
  "platform",
  "progressId",
  "scheduledAt",
  "title",
  "videoChannelId",
  "videoPath",
  "visibility",
]);
const ALLOWED_QUERY_FIELDS = new Set([
  "accountId",
  "platform",
  "status",
  "title",
  "remark",
  "scheduledStart",
  "scheduledEnd",
  "limit",
  "offset",
]);

const ELECTRON_BOOLEAN_SWITCHES = new Set([
  "--disable-gpu",
  "--no-sandbox",
  "--sandbox",
  "--single-process",
  "--disable-software-rasterizer",
]);
const ELECTRON_VALUE_SWITCHES = new Set([
  "--app-path",
  "--inspect",
  "--inspect-brk",
  "--remote-debugging-port",
  "--user-data-dir",
]);

/** 表示 CLI 参数或请求文件格式错误。 */
export class CliRequestError extends Error {
  readonly exitCode: 2 | 4;
  readonly command?: CliCommand;

  /**
   * 创建带退出码的请求校验错误。
   *
   * @param message - 不包含敏感信息的错误摘要
   * @param exitCode - 命令格式错误或业务参数错误
   * @param command - 已识别的 CLI 命令
   */
  constructor(message: string, exitCode: 2 | 4 = 2, command?: CliCommand) {
    super(message);
    this.name = "CliRequestError";
    this.exitCode = exitCode;
    this.command = command;
  }
}

function isCliCommand(value: string | undefined): value is CliCommand {
  return value === "login" || value === "publish" || value === "records";
}

function switchName(argument: string): string {
  return argument.split("=", 1)[0];
}

/** 从应用参数中移除 Electron 自身开关，保留未知开关以阻断旧 CLI 兼容入口。 */
function stripElectronSwitches(argumentsValue: readonly string[]): string[] {
  const applicationArguments: string[] = [];
  for (let index = 0; index < argumentsValue.length; index += 1) {
    const argument = argumentsValue[index];
    if (argument === "--") return [...applicationArguments, ...argumentsValue.slice(index + 1)];
    if (!argument.startsWith("-")) {
      applicationArguments.push(argument);
      continue;
    }
    const name = switchName(argument);
    if (ELECTRON_BOOLEAN_SWITCHES.has(name)) continue;
    if (ELECTRON_VALUE_SWITCHES.has(name)) {
      if (!argument.includes("=")) index += 1;
      continue;
    }
    applicationArguments.push(argument);
  }
  return applicationArguments;
}

/** 从 Electron argv 中剥离运行时参数，只保留应用自己的参数。 */
function extractApplicationArguments(argv: readonly string[], defaultApp: boolean): string[] {
  let index = 1;
  if (defaultApp) {
    while (index < argv.length && argv[index].startsWith("-")) {
      const name = switchName(argv[index]);
      index += ELECTRON_VALUE_SWITCHES.has(name) && !argv[index].includes("=") ? 2 : 1;
    }
    return index < argv.length ? stripElectronSwitches([...argv].slice(index + 1)) : [];
  }

  return stripElectronSwitches([...argv].slice(index));
}

/** 从开发或打包环境的 argv 中提取首个 CLI 位置命令。 */
export function parseCliArguments(
  argv: readonly string[],
  options: CliArgumentParseOptions = {},
): CliArguments | null {
  const applicationArguments = extractApplicationArguments(argv, options.defaultApp ?? false);
  if (applicationArguments.some((argument) => argument.toLowerCase().startsWith("vidpost://"))) return null;

  const command = applicationArguments[0];
  if (!isCliCommand(command)) return null;

  switch (command) {
    case "login": {
      const platform = applicationArguments[1];
      if (!platform) throw new CliRequestError("login 命令缺少平台参数", 2, command);
      if (!PLATFORMS.includes(platform as Platform)) throw new CliRequestError("login 平台参数无效", 2, command);
      if (applicationArguments.length > 2) throw new CliRequestError("login 命令参数过多", 2, command);
      return { command, platform: platform as Platform };
    }
    case "publish": {
      const requestPath = applicationArguments[1];
      if (!requestPath || requestPath.startsWith("-")) throw new CliRequestError("publish 命令缺少请求文件", 2, command);
      if (applicationArguments.length > 2) throw new CliRequestError("publish 命令参数过多", 2, command);
      return { command, requestPath: path.resolve(requestPath) };
    }
    case "records": {
      const queryPath = applicationArguments[1];
      if (queryPath?.startsWith("-")) throw new CliRequestError("records 查询文件参数无效", 2, command);
      if (applicationArguments.length > 2) throw new CliRequestError("records 命令参数过多", 2, command);
      return queryPath ? { command, queryPath: path.resolve(queryPath) } : { command };
    }
  }
}

/** 向 stdout 写入一条不会包含本地路径或认证信息的 JSONL 事件。 */
export function writeCliEvent(event: CliEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

/** 将未知值校验为普通对象。 */
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliRequestError(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

/** 检查对象是否包含未声明字段，阻断服务器授权和远端作品字段混入本地 CLI。 */
function assertAllowedFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknownField = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownField) throw new CliRequestError(`${label}包含不支持的字段: ${unknownField}`);
}

/** 将账号 ID 规范化为正整数。 */
function parseAccountId(value: unknown, label = "accountId"): number {
  if (typeof value !== "number" && typeof value !== "string") throw new CliRequestError(`${label} 必须是本地账号 ID`, 4);
  const normalized = String(value).trim();
  if (!/^\d+$/u.test(normalized) || Number(normalized) <= 0 || !Number.isSafeInteger(Number(normalized))) {
    throw new CliRequestError(`${label} 必须是正整数`, 4);
  }
  return Number(normalized);
}

/** 校验平台专属的正整数参数。 */
function parsePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new CliRequestError(`${field} 必须是正整数`, 4);
  return value;
}

/** 校验素材路径是绝对路径且对应非空普通文件。 */
function assertLocalFile(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value.trim())) throw new CliRequestError(`${field} 必须是本地绝对路径`, 4);
  try {
    const stats = fs.statSync(value.trim());
    if (!stats.isFile() || stats.size <= 0) throw new Error("not-file");
  } catch {
    throw new CliRequestError(`${field} 必须是非空本地文件`, 4);
  }
  return value.trim();
}

/** 将发布请求文件内容校验并转换为现有发布服务需要的输入。 */
export function parseCliRequest(value: unknown): CliRequest {
  const request = requireObject(value, "请求");
  assertAllowedFields(request, ALLOWED_REQUEST_FIELDS, "请求");
  if (request.version !== CLI_VERSION) throw new CliRequestError("请求 version 只支持 1");
  const task = requireObject(request.task, "请求 task");
  assertAllowedFields(task, ALLOWED_TASK_FIELDS, "请求 task");
  const platform = task.platform;
  if (!PLATFORMS.includes(platform as Platform)) throw new CliRequestError("task.platform 不是支持的平台", 4);
  const stringFields = ["accountName", "introduction", "progressId", "scheduledAt", "title"] as const;
  for (const field of stringFields) if (typeof task[field] !== "string") throw new CliRequestError(`task.${field} 必须是字符串`, 4);
  const accountName = String(task.accountName).trim();
  const introduction = String(task.introduction);
  const progressId = String(task.progressId).trim();
  const scheduledAt = String(task.scheduledAt).trim();
  const title = String(task.title).trim();
  if (!accountName || !progressId || !title) throw new CliRequestError("账号名称、progressId 和标题不能为空", 4);
  const scheduleError = validateScheduledAt(platform as Platform, scheduledAt);
  if (scheduleError) throw new CliRequestError(`发布时间参数无效：${scheduleError}`, 4);

  const baseTask = {
    accountId: parseAccountId(task.accountId, "task.accountId"),
    accountName,
    coverPath: assertLocalFile(task.coverPath, "task.coverPath"),
    introduction,
    platform: platform as Platform,
    progressId,
    scheduledAt,
    title,
    videoPath: assertLocalFile(task.videoPath, "task.videoPath"),
  };
  const platformFields = new Set(["channelId", "humanTypeId", "videoChannelId", "visibility"]);
  const allowedPlatformFields = platform === "bilibili"
    ? new Set(["humanTypeId"])
    : platform === "douyin"
      ? new Set(["visibility"])
      : platform === "sohu"
        ? new Set(["channelId", "videoChannelId"])
        : new Set<string>();
  const unsupportedPlatformField = [...Object.keys(task)].find((field) => platformFields.has(field) && !allowedPlatformFields.has(field));
  if (unsupportedPlatformField) throw new CliRequestError(`${platform} 不支持字段 task.${unsupportedPlatformField}`, 4);

  switch (platform) {
    case "bilibili": return { version: 1, task: { ...baseTask, humanTypeId: parsePositiveInteger(task.humanTypeId, "task.humanTypeId") } };
    case "douyin":
      if (task.visibility !== "public" && task.visibility !== "friends" && task.visibility !== "self") throw new CliRequestError("task.visibility 只支持 public、friends 或 self", 4);
      return { version: 1, task: { ...baseTask, visibility: task.visibility } };
    case "sohu": return { version: 1, task: { ...baseTask, channelId: parsePositiveInteger(task.channelId, "task.channelId"), videoChannelId: parsePositiveInteger(task.videoChannelId, "task.videoChannelId") } };
    case "baijiahao": return { version: 1, task: baseTask };
  }
  throw new CliRequestError("task.platform 不是支持的平台", 4);
}

/** 将查询文件内容校验为本地发布记录筛选条件。 */
export function parseCliQuery(value: unknown): PublishRecordListInput {
  const request = requireObject(value, "查询请求");
  assertAllowedFields(request, new Set(["version", "query"]), "查询请求");
  if (request.version !== CLI_VERSION) throw new CliRequestError("查询请求 version 只支持 1");
  const query = requireObject(request.query, "查询请求 query");
  assertAllowedFields(query, ALLOWED_QUERY_FIELDS, "查询请求 query");
  const result: PublishRecordListInput = {};
  if (query.accountId !== undefined) result.accountId = parseAccountId(query.accountId, "query.accountId");
  if (query.platform !== undefined) {
    if (typeof query.platform !== "string" || !PLATFORMS.includes(query.platform as Platform)) throw new CliRequestError("query.platform 不是支持的平台", 4);
    result.platform = query.platform as Platform;
  }
  for (const field of ["status", "title", "remark", "scheduledStart", "scheduledEnd"] as const) {
    if (query[field] !== undefined) {
      if (typeof query[field] !== "string") throw new CliRequestError(`query.${field} 必须是字符串`, 4);
      result[field] = query[field];
    }
  }
  if (query.limit !== undefined) {
    if (typeof query.limit !== "number" || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 300) throw new CliRequestError("query.limit 必须是 1 到 300 的整数", 4);
    result.limit = query.limit;
  }
  if (query.offset !== undefined) {
    if (typeof query.offset !== "number" || !Number.isSafeInteger(query.offset) || query.offset < 0) throw new CliRequestError("query.offset 必须是非负整数", 4);
    result.offset = query.offset;
  }
  return result;
}

/** 将 CLI 任务转换为桌面端共享的发布输入。 */
export function toPublishInput(task: CliTask): PublishInput {
  const base = { accountId: String(task.accountId), accountName: task.accountName, coverPath: task.coverPath, introduction: task.introduction, progressId: task.progressId, scheduledAt: task.scheduledAt, title: task.title, videoPath: task.videoPath };
  switch (task.platform) {
    case "baijiahao": return { ...base, platform: task.platform };
    case "bilibili": return { ...base, humanTypeId: task.humanTypeId as number, platform: task.platform };
    case "douyin": return { ...base, platform: task.platform, visibility: task.visibility as "friends" | "public" | "self" };
    case "sohu": return { ...base, channelId: task.channelId as number, platform: task.platform, videoChannelId: task.videoChannelId as number };
  }
}

/** 将发布、登录和查询错误映射到方案定义的 CLI 退出码。 */
export function classifyCliError(error: unknown): CliExitCode {
  if (error instanceof CliRequestError) return error.exitCode;
  const errors: Error[] = [];
  let current: unknown = error;
  while (current instanceof Error && errors.length < 8) { errors.push(current); current = current.cause; }
  const names = new Set(errors.map((candidate) => candidate.name));
  const message = errors.map((candidate) => candidate.message).join(" | ");
  if (/发布频率|发布额度|账号忙|限流|平台繁忙|服务繁忙|too many requests|rate limit|HTTP 429|SQLITE_BUSY|数据库锁/u.test(message)) return 5;
  if (names.has("AccountPublishQueueBlockedError") && !/网络|超时|timeout|HTTP \d{3}|ECONN|ERR_NETWORK|temporar|请求失败|服务不可用|连接失败|连接被拒绝/u.test(message)) return 3;
  if (/验证码|身份验证|重新登录|登录状态|未登录|已离线|登录失效|账号凭据|账号状态|凭据不完整|Cookie|cookie|csrf|bili_jct|sp-cm|dv-id/u.test(message)) return 3;
  if (/素材|视频|封面|标题|发布时间|scheduledAt|visibility|humanTypeId|channelId|videoChannelId|本地账号|本地文件|不是非空文件/u.test(message)) return 4;
  if (names.has("PlatformInfraError") || names.has("PlatformTimeoutError") || names.has("AxiosError") || /网络|超时|timeout|HTTP \d{3}|ECONN|ERR_NETWORK|temporar|platform|请求失败|服务不可用|连接失败|连接被拒绝/u.test(message)) return 5;
  return 1;
}

/** 删除错误摘要中的请求文件和素材路径，防止 CLI 输出完整本地路径。 */
export function sanitizeCliMessage(error: unknown, request?: CliRequest, requestPath?: string): string {
  let message = error instanceof Error ? error.message : String(error);
  const paths = [requestPath, request?.task.videoPath, request?.task.coverPath].filter((value): value is string => Boolean(value));
  for (const localPath of paths) message = message.split(localPath).join("[local-file]");
  return message
    .replace(/("?(?:authorization|proxy-authorization|cookie|set-cookie|x-csrf-token|x-ware-csrf-token|x-upos-auth|account_file|cookie_file|auth|token|accesskeyid|secretaccesskey|sessiontoken|ms[_-]?token|xmst|sp-cm|dv-id|mp-cv)"?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'[^']*'|[^,}\s]+)/giu, "$1[redacted]")
    .replace(/\bBearer\s+[^\s,}]+/giu, "Bearer [redacted]")
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:Users|home|private|tmp|var|Volumes|opt|mnt|root)\/)[^\s"'`,;]+/gu, "[local-path]");
}

/** 从磁盘读取并校验 JSON 文件。 */
function readJsonFile(filePath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new CliRequestError(`${label}不是有效 JSON`);
    throw new CliRequestError(`无法读取${label}`);
  }
}

/** 递归清理记录中的凭据、账号文件信息和本地绝对路径。 */
function sanitizeCliRecordValue(value: unknown, key?: string): unknown {
  if (key && /authorization|cookie|account[_-]?file|token|secret|password|credential|csrf|accesskey/iu.test(key)) return "[redacted]";
  if (typeof value === "string") return sanitizeCliMessage(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeCliRecordValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeCliRecordValue(entryValue, entryKey)]));
  }
  return value;
}

/** 将本地发布记录转换为不暴露素材完整路径的 CLI 记录。 */
function toCliRecord(record: LocalPublishRecordDTO): CliRecord {
  const { videoPath: _videoPath, coverPath: _coverPath, ...safeRecord } = record;
  return sanitizeCliRecordValue(safeRecord) as CliRecord;
}

/** 执行 CLI 登录命令并复用桌面端账号持久化流程。 */
async function runLogin(args: Extract<CliArguments, { command: "login" }>, options: CliRunOptions): Promise<CliExitCode> {
  writeCliEvent({ version: 1, type: "ready", command: args.command, pid: process.pid });
  try {
    if (options.isCancelled?.()) return 6;
    const [{ createAccount }, { loginAndCreateLocalAccount, resolveDraftAccountFilePath }] = await Promise.all([
      import("@/src/infra/account/account.ts"),
      import("@/src/service/account-service.ts"),
    ]);
    const result = await loginAndCreateLocalAccount(args.platform, resolveDraftAccountFilePath(args.platform), null, createAccount(args.platform));
    if (options.isCancelled?.()) return 6;
    writeCliEvent({ version: 1, type: "result", command: args.command, accountId: String(result.id), nickname: String(result.nickname || result.id), updatedExistingAccount: result.updatedExistingAccount });
    return 0;
  } catch (error) {
    if (options.isCancelled?.()) return 6;
    const code = classifyCliError(error);
    writeCliEvent({ version: 1, type: "error", command: args.command, errorCode: code, message: sanitizeCliMessage(error) });
    return code;
  }
}

/** 执行本地发布记录查询并输出安全的 JSONL 结果。 */
async function runRecords(args: Extract<CliArguments, { command: "records" }>, options: CliRunOptions): Promise<CliExitCode> {
  let query: PublishRecordListInput = {};
  try {
    if (args.queryPath) query = parseCliQuery(readJsonFile(args.queryPath, "查询文件"));
  } catch (error) {
    const code = classifyCliError(error);
    writeCliEvent({ version: 1, type: "error", command: args.command, errorCode: code, message: sanitizeCliMessage(error, undefined, args.queryPath) });
    return code;
  }
  writeCliEvent({ version: 1, type: "ready", command: args.command, pid: process.pid });
  try {
    if (options.isCancelled?.()) return 6;
    const { publishRecordRepository } = await import("@/src/repository/publish-record-repository.ts");
    const records = publishRecordRepository.list(query).map((record) => toCliRecord(record as LocalPublishRecordDTO));
    if (options.isCancelled?.()) return 6;
    writeCliEvent({ version: 1, type: "result", command: args.command, records });
    return 0;
  } catch (error) {
    if (options.isCancelled?.()) return 6;
    const code = classifyCliError(error);
    writeCliEvent({ version: 1, type: "error", command: args.command, errorCode: code, message: sanitizeCliMessage(error, undefined, args.queryPath) });
    return code;
  }
}

/** 执行 CLI 发布请求并输出 JSONL 生命周期事件。 */
async function runPublish(args: Extract<CliArguments, { command: "publish" }>, options: CliRunOptions): Promise<CliExitCode> {
  let request: CliRequest;
  try {
    request = parseCliRequest(readJsonFile(args.requestPath, "请求文件"));
  } catch (error) {
    const code = classifyCliError(error);
    writeCliEvent({ version: 1, type: "error", command: args.command, errorCode: code, message: sanitizeCliMessage(error, undefined, args.requestPath) });
    return code;
  }

  writeCliEvent({ version: 1, type: "ready", command: args.command, pid: process.pid });
  try {
    if (options.isCancelled?.()) return 6;
    const [{ createVideo }, { publishAndUpdateLocalRecord }, { accountRepository }] = await Promise.all([
      import("@/src/infra/video/video.ts"),
      import("@/src/service/task-service.ts"),
      import("@/src/repository/account-repository.ts"),
    ]);
    const localAccount = accountRepository.findById(request.task.accountId);
    if (!localAccount) throw new CliRequestError("本地账号不存在", 4);
    if (localAccount.platform !== request.task.platform) throw new CliRequestError("本地账号与发布平台不匹配", 4);
    const result = await publishAndUpdateLocalRecord(toPublishInput(request.task), createVideo(request.task.platform), (phase) => {
      if (!options.isCancelled?.() && (phase === "preparing" || phase === "publishing")) writeCliEvent({ version: 1, type: "progress", command: args.command, taskId: request.task.progressId, phase });
    });
    if (options.isCancelled?.()) return 6;
    writeCliEvent({ version: 1, type: "result", command: args.command, taskId: request.task.progressId, status: result.status, localRecordId: result.localRecordId, platformWorkId: result.platformWorkId, link: result.link || "" });
    return 0;
  } catch (error) {
    if (options.isCancelled?.()) return 6;
    const code = classifyCliError(error);
    writeCliEvent({ version: 1, type: "error", command: args.command, errorCode: code, message: sanitizeCliMessage(error, request, args.requestPath) });
    return code;
  }
}

/** 分发 CLI 命令并返回约定的进程退出码。 */
export async function runCli(args: CliArguments, options: CliRunOptions = {}): Promise<CliExitCode> {
  switch (args.command) {
    case "login": return runLogin(args, options);
    case "publish": return runPublish(args, options);
    case "records": return runRecords(args, options);
  }
}
