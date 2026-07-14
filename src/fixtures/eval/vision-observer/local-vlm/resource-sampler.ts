import { execFile as execFileCb } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";

import type { LocalVlmGpuTelemetry, LocalVlmResourceTelemetry } from "./local-vlm.types";

const execFile = promisify(execFileCb);

async function workspaceUsage(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      const nested = await workspaceUsage(full);
      bytes += nested.bytes;
      files += nested.files;
      continue;
    }
    if (entry.isFile()) {
      const info = await stat(full);
      bytes += info.size;
      files += 1;
    }
  }
  return { bytes, files };
}

async function rssBytesForPid(pid: number): Promise<number | null> {
  try {
    const result = await execFile("ps", ["-o", "rss=", "-p", String(pid)], {
      timeout: 1_000,
      maxBuffer: 8 * 1024,
    });
    const kb = Number(result.stdout.trim());
    return Number.isFinite(kb) && kb >= 0 ? kb * 1024 : null;
  } catch {
    return null;
  }
}

async function rssBytesForProcessGroup(processGroupId: number | null): Promise<number | null> {
  if (processGroupId === null || process.platform === "win32") return null;
  try {
    const result = await execFile("ps", ["-o", "rss=", "-g", String(processGroupId)], {
      timeout: 1_000,
      maxBuffer: 32 * 1024,
    });
    const bytes = result.stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .reduce((sum, kb) => sum + kb * 1024, 0);
    return bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function emptyGpuTelemetry(): LocalVlmGpuTelemetry {
  return {
    available: false,
    sampleCount: 0,
    peakBytes: null,
    lastBytes: null,
    failureCount: 0,
  };
}

export class ResourceSampler {
  readonly #workspaceDir: string;
  readonly #pid: number;
  readonly #processGroupId: number | null;
  readonly #intervalMs: number;
  readonly #gpu = emptyGpuTelemetry();

  #timer: NodeJS.Timeout | null = null;
  #sampleCount = 0;
  #sampleFailureCount = 0;
  #workspaceBytesBeforeStart = 0;
  #workspacePeakBytes = 0;
  #workspaceBytesBeforeCleanup = 0;
  #fileCountPeak = 0;
  #processRssBytesBeforeTermination: number | null = null;
  #peakProcessRssBytes: number | null = null;
  #peakProcessTreeRssBytes: number | null = null;
  #processRssBytesAfterTermination: number | null = null;
  #started = false;

  constructor(args: {
    workspaceDir: string;
    pid: number;
    processGroupId: number | null;
    intervalMs: number;
  }) {
    this.#workspaceDir = args.workspaceDir;
    this.#pid = args.pid;
    this.#processGroupId = args.processGroupId;
    this.#intervalMs = args.intervalMs;
  }

  async #sampleOnce() {
    try {
      const [workspace, processRss, processTreeRss] = await Promise.all([
        workspaceUsage(this.#workspaceDir),
        rssBytesForPid(this.#pid),
        rssBytesForProcessGroup(this.#processGroupId),
      ]);
      if (!this.#started) {
        this.#workspaceBytesBeforeStart = workspace.bytes;
        this.#started = true;
      }
      this.#workspaceBytesBeforeCleanup = workspace.bytes;
      this.#workspacePeakBytes = Math.max(this.#workspacePeakBytes, workspace.bytes);
      this.#fileCountPeak = Math.max(this.#fileCountPeak, workspace.files);
      this.#peakProcessRssBytes = Math.max(this.#peakProcessRssBytes ?? 0, processRss ?? 0) || null;
      this.#peakProcessTreeRssBytes =
        Math.max(this.#peakProcessTreeRssBytes ?? 0, processTreeRss ?? 0) || null;
      this.#sampleCount += 1;
    } catch {
      this.#sampleFailureCount += 1;
    }
  }

  async start(): Promise<void> {
    await this.#sampleOnce();
    this.#timer = setInterval(() => {
      void this.#sampleOnce();
    }, this.#intervalMs);
    this.#timer.unref();
  }

  async markBeforeTermination(): Promise<void> {
    this.#processRssBytesBeforeTermination = await rssBytesForPid(this.#pid);
    await this.#sampleOnce();
  }

  async stop(args: {
    workspaceBytesAfterCleanup: number | null;
  }): Promise<LocalVlmResourceTelemetry> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#processRssBytesAfterTermination = await rssBytesForPid(this.#pid);
    return {
      workspaceBytesBeforeStart: this.#workspaceBytesBeforeStart,
      workspacePeakBytes: this.#workspacePeakBytes,
      workspaceBytesBeforeCleanup: this.#workspaceBytesBeforeCleanup,
      workspaceBytesAfterCleanup: args.workspaceBytesAfterCleanup,
      fileCountPeak: this.#fileCountPeak,
      filesCreated: this.#fileCountPeak,
      quarantinedFiles: 0,
      processRssBytesBeforeTermination: this.#processRssBytesBeforeTermination,
      peakProcessRssBytes: this.#peakProcessRssBytes,
      peakProcessTreeRssBytes: this.#peakProcessTreeRssBytes,
      processRssBytesAfterTermination: this.#processRssBytesAfterTermination,
      sampleCount: this.#sampleCount,
      sampleFailureCount: this.#sampleFailureCount,
      gpu: this.#gpu,
    };
  }
}
