"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isPublicIPv4, normalizeTargetUrl } = require("../target-safety");

test("accepts ordinary public IPv4 addresses", () => {
  assert.equal(isPublicIPv4("8.8.8.8"), true);
  assert.equal(isPublicIPv4("1.1.1.1"), true);
});

test("blocks private, local, shared, documentation, and special-use IPv4 ranges", () => {
  for (const address of [
    "0.0.0.1", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.0.2.1",
    "192.168.1.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "240.0.0.1",
  ]) {
    assert.equal(isPublicIPv4(address), false, address);
  }
});

test("normalizes public HTTP and HTTPS URLs", () => {
  assert.equal(normalizeTargetUrl("example.com").protocol, "https:");
  assert.equal(normalizeTargetUrl("http://example.com").protocol, "http:");
});

test("rejects credentials, unsupported protocols, nonstandard ports, and private IP literals", () => {
  for (const input of [
    "ftp://example.com", "https://user:pass@example.com",
    "http://example.com:8080", "http://127.0.0.1",
    "http://192.168.1.1", "https://[::1]",
  ]) {
    assert.throws(() => normalizeTargetUrl(input), undefined, input);
  }
});
