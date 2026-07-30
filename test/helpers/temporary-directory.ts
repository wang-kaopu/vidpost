import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 记录测试创建的临时目录，并在测试文件结束时统一回收。
 */
export class TemporaryDirectoryScope {
  private readonly directories = new Set<string>();

  /**
   * 异步创建一个临时目录。
   *
   * @param prefix - 临时目录名称前缀
   * @returns 临时目录绝对路径
   */
  async create(prefix: string): Promise<string> {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
    this.directories.add(directory);
    return directory;
  }

  /**
   * 同步创建一个临时目录。
   *
   * @param prefix - 临时目录名称前缀
   * @returns 临时目录绝对路径
   */
  createSync(prefix: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.directories.add(directory);
    return directory;
  }

  /**
   * 删除当前测试文件创建的全部临时目录。
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      [...this.directories].map((directory) => fs.promises.rm(directory, { force: true, recursive: true })),
    );
    this.directories.clear();
  }
}
