import { spawn, type ChildProcess } from "node:child_process";
import { createServer, Socket } from "node:net";

import { isoNow, BoundedByteCounter } from "./process-telemetry";
import { ResourceSampler } from "./resource-sampler";
import type {
  LlamaServerLaunchSpec,
  LocalVlmObservationFailureShape,
  LocalVlmProcessTelemetry,
} from "./local-vlm.types";

async function allocateLoopbackPort(host: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate loopback port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = new Socket();
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function asFailureShape(error: unknown): LocalVlmObservationFailureShape | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "issues" in error
  ) {
    return error as LocalVlmObservationFailureShape;
  }
  return null;
}

export class OwnedLlamaServerProcess {
  readonly launchSpec: LlamaServerLaunchSpec;
  readonly child: ChildProcess;
  readonly telemetry: LocalVlmProcessTelemetry;
  readonly sampler: ResourceSampler;

  #host: string;
  #terminationTimeoutMs: number;
  #stdoutCounter: BoundedByteCounter;
  #stderrCounter: BoundedByteCounter;
  #exitPromise: Promise<void>;
  #exitResolve!: () => void;
  #terminated = false;

  constructor(args: {
    launchSpec: LlamaServerLaunchSpec;
    child: ChildProcess;
    host: string;
    terminationTimeoutMs: number;
    stdoutBytesMax: number;
    stderrBytesMax: number;
    sampler: ResourceSampler;
  }) {
    this.launchSpec = args.launchSpec;
    this.child = args.child;
    this.#host = args.host;
    this.#terminationTimeoutMs = args.terminationTimeoutMs;
    this.#stdoutCounter = new BoundedByteCounter(args.stdoutBytesMax);
    this.#stderrCounter = new BoundedByteCounter(args.stderrBytesMax);
    this.sampler = args.sampler;
    this.telemetry = {
      pid: args.child.pid ?? null,
      processGroupId:
        process.platform === "win32" || args.child.pid === undefined ? null : args.child.pid,
      port: args.launchSpec.port,
      spawnedAt: isoNow(),
      readyAt: null,
      requestStartedAt: null,
      requestCompletedAt: null,
      terminationRequestedAt: null,
      exitedAt: null,
      exitCode: null,
      exitSignal: null,
      forcedTermination: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      readiness: {
        attempts: 0,
        firstSuccessfulReadyAt: null,
        totalStartupLatencyMs: null,
        lastReadinessError: null,
        processExitedBeforeReady: false,
        startupTimedOut: false,
      },
      portReleased: null,
    };

    this.#stdoutCounter.attach(args.child.stdout);
    this.#stderrCounter.attach(args.child.stderr);

    this.#exitPromise = new Promise<void>((resolve) => {
      this.#exitResolve = resolve;
    });

    args.child.once("exit", (code, signal) => {
      this.telemetry.exitedAt = isoNow();
      this.telemetry.exitCode = code;
      this.telemetry.exitSignal = signal;
      this.telemetry.stdoutBytes = this.#stdoutCounter.bytes;
      this.telemetry.stderrBytes = this.#stderrCounter.bytes;
      this.telemetry.stdoutTruncated = this.#stdoutCounter.truncated;
      this.telemetry.stderrTruncated = this.#stderrCounter.truncated;
      if (this.telemetry.readyAt === null) {
        this.telemetry.readiness.processExitedBeforeReady = true;
      }
      this.#exitResolve();
    });
  }

  get exited(): boolean {
    return this.telemetry.exitedAt !== null;
  }

  noteReadinessAttempt(ok: boolean, error: string | null, startedAt: number) {
    this.telemetry.readiness.attempts += 1;
    if (ok) {
      const at = isoNow();
      this.telemetry.readyAt = at;
      this.telemetry.readiness.firstSuccessfulReadyAt = at;
      this.telemetry.readiness.totalStartupLatencyMs = Math.max(0, performance.now() - startedAt);
    } else if (error) {
      this.telemetry.readiness.lastReadinessError = error;
    }
  }

  markReadinessTimeout() {
    this.telemetry.readiness.startupTimedOut = true;
  }

  markRequestStarted() {
    this.telemetry.requestStartedAt = isoNow();
  }

  markRequestCompleted() {
    this.telemetry.requestCompletedAt = isoNow();
  }

  async terminate(): Promise<void> {
    if (this.#terminated) return;
    this.#terminated = true;

    await this.sampler.markBeforeTermination();
    this.telemetry.terminationRequestedAt = isoNow();

    const tryKill = (signal: NodeJS.Signals) => {
      try {
        if (this.telemetry.processGroupId !== null && process.platform !== "win32") {
          process.kill(-this.telemetry.processGroupId, signal);
          return;
        }
        this.child.kill(signal);
      } catch {
        // Process may already be gone.
      }
    };

    tryKill("SIGTERM");
    const graceful = await Promise.race([
      this.#exitPromise.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), this.#terminationTimeoutMs)),
    ]);

    if (!graceful && !this.exited) {
      this.telemetry.forcedTermination = true;
      tryKill("SIGKILL");
      const forced = await Promise.race([
        this.#exitPromise.then(() => true),
        new Promise<false>((resolve) =>
          setTimeout(() => resolve(false), this.#terminationTimeoutMs),
        ),
      ]);
      if (!forced && !this.exited) {
        throw {
          code: "PROCESS_TERMINATION_FAILED",
          message: "The local VLM child process did not exit after forced termination.",
          issues: [`pid=${this.telemetry.pid ?? "unknown"}`],
        } satisfies LocalVlmObservationFailureShape;
      }
    }

    this.telemetry.portReleased = await this.waitForPortRelease();
    if (this.telemetry.portReleased !== true) {
      throw {
        code: "PORT_RELEASE_FAILED",
        message: "The local VLM server port remained open after termination.",
        issues: [`port=${this.telemetry.port}`],
      } satisfies LocalVlmObservationFailureShape;
    }
  }

  async waitForExit(): Promise<void> {
    await this.#exitPromise;
  }

  async waitForPortRelease(): Promise<boolean> {
    const deadline = Date.now() + this.#terminationTimeoutMs;
    while (Date.now() <= deadline) {
      if (!(await isPortOpen(this.#host, this.telemetry.port))) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !(await isPortOpen(this.#host, this.telemetry.port));
  }

  async finalizeResources(workspaceBytesAfterCleanup: number | null) {
    return await this.sampler.stop({ workspaceBytesAfterCleanup });
  }
}

export async function spawnOwnedLlamaServerProcess(args: {
  launchSpec: Omit<LlamaServerLaunchSpec, "port"> & { port?: number };
  workspaceDir: string;
  host: string;
  stdoutBytesMax: number;
  stderrBytesMax: number;
  resourceSampleIntervalMs: number;
  terminationTimeoutMs: number;
}): Promise<OwnedLlamaServerProcess> {
  const port =
    args.launchSpec.port !== undefined &&
    Number.isInteger(args.launchSpec.port) &&
    args.launchSpec.port > 0
      ? args.launchSpec.port
      : await allocateLoopbackPort(args.host);
  const resolvedArgs = [...args.launchSpec.args];
  const portIndex = resolvedArgs.indexOf("--port");
  if (portIndex >= 0 && portIndex + 1 < resolvedArgs.length) {
    resolvedArgs[portIndex + 1] = String(port);
  } else {
    resolvedArgs.push("--port", String(port));
  }
  const launchSpec: LlamaServerLaunchSpec = {
    ...args.launchSpec,
    args: resolvedArgs,
    sanitizedRuntimeArguments: resolvedArgs,
    port,
  };
  const child = spawn(launchSpec.command, [...launchSpec.args], {
    cwd: args.workspaceDir,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const sampler = new ResourceSampler({
    workspaceDir: args.workspaceDir,
    pid: child.pid ?? -1,
    processGroupId: process.platform === "win32" ? null : (child.pid ?? null),
    intervalMs: args.resourceSampleIntervalMs,
  });
  await sampler.start();

  return new OwnedLlamaServerProcess({
    launchSpec,
    child,
    host: args.host,
    terminationTimeoutMs: args.terminationTimeoutMs,
    stdoutBytesMax: args.stdoutBytesMax,
    stderrBytesMax: args.stderrBytesMax,
    sampler,
  });
}

export function localVlmFailureFromUnknown(error: unknown): LocalVlmObservationFailureShape {
  return (
    asFailureShape(error) ?? {
      code: "INVALID_OBSERVER_OUTPUT",
      message: error instanceof Error ? error.message : String(error),
      issues: [],
    }
  );
}
