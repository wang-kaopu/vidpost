import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, ".build");
const tsconfigPath = path.join(projectRoot, "tsconfig.json");

/**
 * 构建 Electron 主进程 ESM 和 sandbox preload CommonJS 产物。
 */
export async function buildElectron(): Promise<void> {
  await fs.rm(outputDirectory, { recursive: true, force: true });

  await Promise.all([
    build({
      bundle: true,
      entryPoints: [path.join(projectRoot, "main.ts")],
      external: ["electron", "electron/*", "playwright", "playwright/*"],
      format: "esm",
      outfile: path.join(outputDirectory, "main.js"),
      packages: "external",
      platform: "node",
      sourcemap: true,
      target: "node22",
      tsconfig: tsconfigPath,
    }),
    build({
      bundle: true,
      entryPoints: [path.join(projectRoot, "preload.ts")],
      external: ["electron", "electron/*"],
      format: "cjs",
      outfile: path.join(outputDirectory, "preload.cjs"),
      packages: "external",
      platform: "node",
      sourcemap: true,
      target: "node22",
      tsconfig: tsconfigPath,
    }),
    build({
      bundle: true,
      stdin: {
        contents:
          'import { runDouyinUploadRenderer } from "@/src/infra/video/douyin/upload.ts"; runDouyinUploadRenderer();',
        resolveDir: projectRoot,
        sourcefile: "douyin-publish-renderer-entry.ts",
      },
      external: ["electron", "electron/*", "playwright", "playwright/*"],
      format: "iife",
      logOverride: { "empty-import-meta": "silent" },
      outfile: path.join(outputDirectory, "douyin-publish-renderer.js"),
      platform: "node",
      sourcemap: true,
      target: "node22",
      tsconfig: tsconfigPath,
    }),
  ]);
}

await buildElectron();
