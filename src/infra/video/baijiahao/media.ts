import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";

import { createFile, type Movie } from "mp4box";
import sharp from "sharp";

const MP4_READ_SIZE = 1024 * 1024;

/** 百家号发布所需的 MP4 元数据。 */
export interface BaijiahaoVideoMetadata {
  duration: number;
  height: number;
  size: number;
  videoType: "horizontal" | "vertical";
  width: number;
}

/** 百家号横版和竖版封面。 */
export interface BaijiahaoGeneratedCovers {
  horizontal: Buffer;
  vertical: Buffer;
}

/**
 * 使用 MP4Box 渐进解析 MP4 元数据，不保留媒体数据。
 *
 * @param videoPath - MP4 文件路径
 * @returns 时长、尺寸、大小和横竖版判断
 */
export async function inspectBaijiahaoMp4(videoPath: string): Promise<BaijiahaoVideoMetadata> {
  const fileStats = await stat(videoPath);
  if (!fileStats.isFile() || fileStats.size <= 0) {
    throw new Error("视频路径不是非空文件");
  }
  const mp4File = createFile(false);
  let movie: Movie | undefined;
  let parserError: string | undefined;
  mp4File.onReady = (info) => {
    movie = info;
  };
  mp4File.onError = (message) => {
    parserError = String(message);
  };

  const handle = await open(videoPath, "r");
  try {
    for (let offset = 0; offset < fileStats.size && movie === undefined; offset += MP4_READ_SIZE) {
      const length = Math.min(MP4_READ_SIZE, fileStats.size - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead === 0) break;
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) as ArrayBuffer & {
        fileStart: number;
      };
      arrayBuffer.fileStart = offset;
      mp4File.appendBuffer(arrayBuffer);
      if (parserError) break;
    }
    if (movie === undefined && !parserError) {
      mp4File.flush();
    }
  } finally {
    await handle.close();
  }

  if (parserError) {
    throw new Error(`MP4 解析失败：${parserError}`);
  }
  if (!movie) {
    throw new Error("MP4 解析失败：未找到 moov 元数据");
  }
  const videoTrack = movie.tracks.find((track) => track.video !== undefined);
  const width = videoTrack?.video?.width ?? videoTrack?.track_width;
  const height = videoTrack?.video?.height ?? videoTrack?.track_height;
  const duration = movie.timescale > 0 ? movie.duration / movie.timescale : 0;
  if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("MP4 缺少有效的视频尺寸或时长");
  }
  return { duration, height, size: fileStats.size, videoType: width >= height ? "horizontal" : "vertical", width };
}

/**
 * 流式计算视频文件 MD5，供百家号预上传和分片接口复用。
 *
 * @param videoPath - 视频文件路径
 * @returns 小写十六进制 MD5
 */
export async function calculateBaijiahaoVideoMd5(videoPath: string): Promise<string> {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(videoPath) as AsyncIterable<Buffer>) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/**
 * 从单个源封面生成固定尺寸的横版和竖版 JPEG Buffer。
 *
 * @param coverPath - 任意 Sharp 支持的源图片路径
 * @returns 1280×720 横版和 1080×1440 竖版封面
 */
export async function generateBaijiahaoCovers(coverPath: string): Promise<BaijiahaoGeneratedCovers> {
  const source = await readFile(coverPath);
  const image = sharp(source).rotate();
  const [horizontal, vertical] = await Promise.all([
    image
      .clone()
      .resize(1280, 720, { fit: "cover", position: sharp.strategy.attention, withoutEnlargement: false })
      .jpeg({ chromaSubsampling: "4:4:4", quality: 90 })
      .toBuffer(),
    image
      .clone()
      .resize(1080, 1440, { fit: "cover", position: sharp.strategy.attention, withoutEnlargement: false })
      .jpeg({ chromaSubsampling: "4:4:4", quality: 90 })
      .toBuffer(),
  ]);
  return { horizontal, vertical };
}
