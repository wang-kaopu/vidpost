import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { logger as browserLogger } from "@/app/src/utils/logger.ts";
import { configureLogger, logger as nodeLogger, shutdownLogger, writeRendererLog } from "@/src/utils/logger.ts";

const PREFIX_PATTERN = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] - \[agenthunt\] - \[(INFO|ERROR)\] - /u;

/** 捕获一次 logger 调用写入的控制台文本。 */
function captureConsole(method: "info" | "error", callback: () => void): string {
  const original = console[method];
  let captured = "";
  console[method] = ((value: unknown) => {
    captured = String(value);
  }) as typeof console[typeof method];
  try {
    callback();
  } finally {
    console[method] = original;
  }
  return captured;
}

for (const [name, logger] of [["Node", nodeLogger], ["浏览器", browserLogger]] as const) {
  test(`${name} logger 输出固定前缀、等级和紧凑 JSON`, () => {
    const output = captureConsole("info", () => logger.info("请求完成", { body: { ok: true }, status: 200 }));
    assert.match(output, PREFIX_PATTERN);
    assert.match(output, /\[INFO\] - 请求完成 \{"body":\{"ok":true\},"status":200\}$/u);
    assert.equal(output.includes("\n"), false);
  });

  test(`${name} logger 安全序列化 Error、BigInt、undefined 和循环引用`, () => {
    const circular: Record<string, unknown> = { value: 1n, missing: undefined };
    circular.self = circular;
    const output = captureConsole("error", () => logger.error("发布失败", new Error("boom"), circular));
    assert.match(output, /\[ERROR\] - 发布失败 /u);
    assert.match(output, /"name":"Error","message":"boom","stack":"Error: boom\\n/u);
    assert.match(output, /"value":"1n","missing":"\[undefined\]","self":"\[Circular\]"/u);
  });

  test(`${name} logger 将 TypedArray 的 Base64 预览限制为 100 个字符`, () => {
    const bytes = Uint8Array.from({ length: 120 }, (_, index) => index);
    const output = captureConsole("info", () => logger.info(bytes));
    const expectedPreview = Buffer.from(bytes).toString("base64").slice(0, 100);
    assert.equal(output.includes(`"type":"Uint8Array","byteLength":120,"previewBase64":"${expectedPreview}","truncated":true`), true);
  });

  test(`${name} logger 展开 FormData 并以元数据展示 Blob`, () => {
    const formData = new FormData();
    formData.append("tag", "first");
    formData.append("tag", "second");
    formData.append("file", new Blob(["binary"], { type: "image/jpeg" }));
    const output = captureConsole("info", () => logger.info(formData));
    assert.match(output, /"tag":\["first","second"\]/u);
    assert.match(output, /"file":\{"type":"File","name":"blob","mimeType":"image\/jpeg","byteLength":6\}/u);
  });
}

test("Node logger 将 Buffer 标记为 Buffer", () => {
  const output = captureConsole("info", () => nodeLogger.info(Buffer.from("hello")));
  assert.match(output, /\{"type":"Buffer","byteLength":5,"previewBase64":"aGVsbG8=","truncated":false\}$/u);
});

test("logger 只在整条多行文本前添加一次前缀", () => {
  const output = captureConsole("info", () => nodeLogger.info("第一行\n第二行"));
  assert.equal((output.match(/\[agenthunt\]/gu) ?? []).length, 1);
  assert.match(output, /\[INFO\] - 第一行\n第二行$/u);
});

test("浏览器 logger 通过 electronAPI 转发格式化后的日志", () => {
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const originalWindow = runtime.window;
  let forwarded = "";
  runtime.window = {
    electronAPI: {
      logger: {
        error: () => undefined,
        info: (message: string) => {
          forwarded = message;
        },
      },
    },
  } as unknown as Window;

  try {
    captureConsole("info", () => browserLogger.info("renderer message"));
  } finally {
    if (originalWindow) {
      runtime.window = originalWindow;
    } else {
      delete runtime.window;
    }
  }

  assert.match(forwarded, /\[INFO\] - renderer message$/u);
});

test("log4js 将主进程和 renderer 日志写入独立文件", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "agenthunt-logger-"));
  t.after(() => fs.rmSync(logDirectory, { force: true, recursive: true }));
  configureLogger(logDirectory);

  captureConsole("info", () => nodeLogger.info("electron file message"));
  writeRendererLog("error", "renderer file message");
  await shutdownLogger();

  assert.match(fs.readFileSync(path.join(logDirectory, "electron.log"), "utf8"), /electron file message/u);
  assert.match(fs.readFileSync(path.join(logDirectory, "renderer.log"), "utf8"), /renderer file message/u);
});

test("logger 启动时将超过 24 小时的日志轮转为数字序号文件", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "agenthunt-logger-rollover-"));
  t.after(() => fs.rmSync(logDirectory, { force: true, recursive: true }));
  const previousWindow = new Date(Date.now() - 25 * 60 * 60 * 1000);

  for (const filename of ["electron.log", "renderer.log"]) {
    const currentPath = path.join(logDirectory, filename);
    fs.writeFileSync(currentPath, `${filename} previous day`);
    fs.writeFileSync(`${currentPath}.1`, `${filename} older day`);
    fs.utimesSync(currentPath, previousWindow, previousWindow);
  }

  configureLogger(logDirectory);
  captureConsole("info", () => nodeLogger.info("new electron day"));
  writeRendererLog("info", "new renderer day");
  await shutdownLogger();

  for (const filename of ["electron.log", "renderer.log"]) {
    const currentPath = path.join(logDirectory, filename);
    assert.match(fs.readFileSync(`${currentPath}.1`, "utf8"), /previous day/u);
    assert.match(fs.readFileSync(`${currentPath}.2`, "utf8"), /older day/u);
    assert.equal(fs.existsSync(`${currentPath}.7`), false);
  }
});

test("logger 重启时继续未满 24 小时的当前日志窗口", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "agenthunt-logger-resume-"));
  t.after(() => fs.rmSync(logDirectory, { force: true, recursive: true }));
  const activeWindow = new Date(Date.now() - 23 * 60 * 60 * 1000);

  for (const filename of ["electron.log", "renderer.log"]) {
    const currentPath = path.join(logDirectory, filename);
    fs.writeFileSync(currentPath, `${filename} active window\n`);
    fs.utimesSync(currentPath, activeWindow, activeWindow);
  }

  configureLogger(logDirectory);
  captureConsole("info", () => nodeLogger.info("continued electron window"));
  writeRendererLog("info", "continued renderer window");
  await shutdownLogger();

  for (const filename of ["electron.log", "renderer.log"]) {
    const currentPath = path.join(logDirectory, filename);
    assert.match(fs.readFileSync(currentPath, "utf8"), /active window/u);
    assert.equal(fs.existsSync(`${currentPath}.1`), false);
  }
});
