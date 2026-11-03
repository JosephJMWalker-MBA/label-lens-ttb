import { isIP } from "node:net";

/**
 * Network boundary for the vision reader.
 *
 * Label artwork must never leave the operator's own network. The vision model
 * runs on hardware the operator controls (for example a Jetson Orin on the
 * office LAN), so every address the reader connects to must be private,
 * loopback, link-local, or carrier-grade NAT space (which overlay networks such
 * as Tailscale use). There is deliberately no override: a public address is a
 * configuration error, not a mode.
 *
 * The check runs on the *resolved* address at connect time (see client.ts), so a
 * hostname that resolves to a public address is refused even if the name looks
 * internal.
 */

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function isPrivateIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / Tailscale
  return false;
}

function expandIpv6(address: string): number[] | null {
  // Strip a zone index such as fe80::1%eth0.
  const withoutZone = address.split("%")[0].toLowerCase();
  let head = withoutZone;
  let embeddedV4: number[] | null = null;
  const lastColon = withoutZone.lastIndexOf(":");
  const tail = withoutZone.slice(lastColon + 1);
  if (tail.includes(".")) {
    embeddedV4 = ipv4Octets(tail);
    if (!embeddedV4) return null;
    head = withoutZone.slice(0, lastColon + 1) + "0:0";
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const words = groups.map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
  );
  if (!words.every(Number.isInteger)) return null;
  if (embeddedV4) {
    words[6] = (embeddedV4[0] << 8) | embeddedV4[1];
    words[7] = (embeddedV4[2] << 8) | embeddedV4[3];
  }
  return words;
}

function isPrivateIpv6(address: string): boolean {
  const words = expandIpv6(address);
  if (!words) return false;
  // ::1 loopback
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
  // fc00::/7 unique local
  if ((words[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local
  if ((words[0] & 0xffc0) === 0xfe80) return true;
  // ::ffff:a.b.c.d IPv4-mapped: judge the embedded IPv4 address
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const v4 = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join(".");
    return isPrivateIpv4(v4);
  }
  return false;
}

/** True only for addresses that cannot route to the public internet. */
export function isPrivateNetworkAddress(address: string): boolean {
  const family = isIP(address.split("%")[0]);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}
