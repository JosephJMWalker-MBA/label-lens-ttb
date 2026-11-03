import dns, { type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import type { VisionConfig } from "./config";
import { isPrivateNetworkAddress } from "./private-network";

/**
 * Minimal OpenAI-compatible HTTP client for the private vision host.
 *
 * It is written on node:http rather than fetch for one reason: the `lookup`
 * hook lets every resolved address be checked at connect time, so artwork can
 * only ever be sent to a private-network host even if DNS changes underneath a
 * hostname. Responses are size-bounded and time-bounded, and failures are typed
 * so callers can fall back to local OCR instead of failing the analysis.
 */

export type VisionTransportErrorCode =
  | "NETWORK_REFUSED"
  | "CONNECT_FAILED"
  | "TIMEOUT"
  | "HTTP_STATUS"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON";

export class VisionTransportError extends Error {
  constructor(
    readonly code: VisionTransportErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VisionTransportError";
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** dns.lookup wrapper that refuses any non-private address. */
export function privateOnlyLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const list = addresses as LookupAddress[];
    const refused =
      list.length === 0 || list.some((entry) => !isPrivateNetworkAddress(entry.address));
    if (refused) {
      const refusal: NodeJS.ErrnoException = new VisionTransportError(
        "NETWORK_REFUSED",
        `Vision host ${hostname} resolved to a non-private address; refusing to send artwork.`,
      );
      callback(refusal, []);
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

function apiUrl(endpoint: URL, path: string): URL {
  const base = endpoint.pathname.replace(/\/+$/, "");
  const prefix = base.endsWith("/v1") ? base : `${base}/v1`;
  const url = new URL(endpoint.toString());
  url.pathname = `${prefix}${path}`;
  url.search = "";
  url.hash = "";
  return url;
}

export interface VisionHttpResult {
  status: number;
  body: unknown;
  rawBytes: number;
  latencyMs: number;
}

export async function visionRequest(
  config: Pick<VisionConfig, "endpoint" | "apiKey" | "timeoutMs" | "maxResponseBytes">,
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<VisionHttpResult> {
  const url = apiUrl(config.endpoint, path);
  const literalHost = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literalHost) && !isPrivateNetworkAddress(literalHost)) {
    throw new VisionTransportError(
      "NETWORK_REFUSED",
      "Vision endpoint is a public address; refusing to send artwork.",
    );
  }

  const body = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), "utf8");
  const transport = url.protocol === "https:" ? https : http;
  const started = performance.now();

  return await new Promise<VisionHttpResult>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      action();
    };

    const request = transport.request(
      url,
      {
        method,
        lookup: privateOnlyLookup as unknown as typeof dns.lookup,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.apiKey}`,
          ...(body
            ? { "content-type": "application/json", "content-length": String(body.length) }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > config.maxResponseBytes) {
            request.destroy();
            finish(() =>
              reject(
                new VisionTransportError(
                  "RESPONSE_TOO_LARGE",
                  `Vision response exceeded ${config.maxResponseBytes} bytes.`,
                ),
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", (error) =>
          finish(() => reject(new VisionTransportError("CONNECT_FAILED", error.message))),
        );
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          const latencyMs = Math.round(performance.now() - started);
          if (status < 200 || status >= 300) {
            finish(() =>
              reject(
                new VisionTransportError(
                  "HTTP_STATUS",
                  `Vision host answered HTTP ${status}.`,
                  status,
                ),
              ),
            );
            return;
          }
          try {
            const parsed: unknown = JSON.parse(text);
            finish(() => resolve({ status, body: parsed, rawBytes: received, latencyMs }));
          } catch {
            finish(() =>
              reject(new VisionTransportError("INVALID_JSON", "Vision host returned non-JSON.")),
            );
          }
        });
      },
    );

    const deadline = setTimeout(() => {
      request.destroy();
      finish(() =>
        reject(
          new VisionTransportError(
            "TIMEOUT",
            `Vision host did not answer within ${config.timeoutMs} ms.`,
          ),
        ),
      );
    }, config.timeoutMs);

    request.on("error", (error) => {
      const code =
        error instanceof VisionTransportError ||
        (error as { code?: string }).code === "NETWORK_REFUSED"
          ? "NETWORK_REFUSED"
          : "CONNECT_FAILED";
      finish(() => reject(new VisionTransportError(code, error.message)));
    });

    if (body) request.write(body);
    request.end();
  });
}
