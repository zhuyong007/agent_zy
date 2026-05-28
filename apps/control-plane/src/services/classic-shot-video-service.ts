import { mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export interface ClassicShotVideoFrame {
  index: number;
  timestampSeconds: number;
  dataUrl: string;
}

export interface ClassicShotVideoProcessorInput {
  videoPath: string;
  workDir: string;
  frameCount: number;
}

export interface ClassicShotVideoProcessorResult {
  durationSeconds: number;
  frames: ClassicShotVideoFrame[];
}

export interface ClassicShotVideoProcessor {
  extractFrames(input: ClassicShotVideoProcessorInput): Promise<ClassicShotVideoProcessorResult>;
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        rejectPromise(new Error(`未找到视频处理工具：${basename(command)}，请安装 ffmpeg/ffprobe 或设置 FFMPEG_PATH/FFPROBE_PATH`));
        return;
      }

      rejectPromise(error);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdout).toString("utf8").trim());
        return;
      }

      rejectPromise(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with code ${code}`));
    });
  });
}

function frameTimestamps(durationSeconds: number, frameCount: number) {
  if (frameCount <= 1) {
    return [Math.max(durationSeconds / 2, 0)];
  }

  const safeDuration = Math.max(durationSeconds, 0.1);

  return Array.from({ length: frameCount }, (_, index) => {
    const ratio = index / (frameCount - 1);
    const timestamp = safeDuration * ratio;

    return Math.min(Math.max(timestamp, 0), Math.max(safeDuration - 0.05, 0));
  });
}

export function createClassicShotVideoProcessor(options?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): ClassicShotVideoProcessor {
  const ffmpegPath = options?.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const ffprobePath = options?.ffprobePath ?? process.env.FFPROBE_PATH ?? "ffprobe";

  return {
    async extractFrames(input) {
      const durationText = await runCommand(ffprobePath, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input.videoPath
      ]);
      const durationSeconds = Number.parseFloat(durationText);

      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error("无法读取上传视频时长");
      }

      const timestamps = frameTimestamps(durationSeconds, input.frameCount);
      const tempFrameDir = await mkdtemp(join(input.workDir, "frames-"));
      const frames: ClassicShotVideoFrame[] = [];

      try {
        for (const [index, timestampSeconds] of timestamps.entries()) {
          const framePath = resolve(tempFrameDir, `frame-${String(index + 1).padStart(2, "0")}.jpg`);

          await runCommand(ffmpegPath, [
            "-y",
            "-ss",
            timestampSeconds.toFixed(3),
            "-i",
            input.videoPath,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            framePath
          ]);

          const data = await readFile(framePath);

          frames.push({
            index: index + 1,
            timestampSeconds: Number(timestampSeconds.toFixed(3)),
            dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`
          });
        }
      } finally {
        await rm(tempFrameDir, { recursive: true, force: true });
      }

      return {
        durationSeconds,
        frames
      };
    }
  };
}

export async function cleanupClassicShotVideoWorkDir(workDir: string) {
  await rm(workDir, {
    recursive: true,
    force: true
  });
}
