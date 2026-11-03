// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isPrivateNetworkAddress } from "./private-network";

describe("isPrivateNetworkAddress", () => {
  it.each([
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.50",
    "127.0.0.1",
    "169.254.10.10",
    "100.64.0.1",
    "100.127.255.254",
    "::1",
    "fd12:3456:789a::1",
    "fe80::1",
    "fe80::1%eth0",
    "::ffff:192.168.1.20",
  ])("allows private address %s", (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "172.32.0.1",
    "172.15.255.255",
    "192.169.0.1",
    "100.128.0.1",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "orin.local",
    "",
    "999.1.1.1",
  ])("refuses public or non-IP value %s", (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(false);
  });
});
