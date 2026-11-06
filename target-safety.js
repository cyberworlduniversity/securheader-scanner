"use strict";

const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const BLOCKED_IPV4_CIDRS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4ToNumber(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").reduce((value, part) => ((value * 256) + Number(part)) >>> 0, 0);
}

function isInCidr(address, network, prefix) {
  const ipValue = ipv4ToNumber(address);
  const networkValue = ipv4ToNumber(network);
  if (ipValue === null || networkValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (networkValue & mask);
}

function isPublicIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  return !BLOCKED_IPV4_CIDRS.some(([network, prefix]) => isInCidr(address, network, prefix));
}

function normalizeTargetUrl(input) {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2048) {
    throw new Error("A valid URL (up to 2048 characters) is required.");
  }
  const raw = input.trim();
  const explicitScheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (explicitScheme && !["http", "https"].includes(explicitScheme[1].toLowerCase())) {
    throw new Error("Only HTTP and HTTPS targets are supported.");
  }
  const candidate = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
  const target = new URL(candidate);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS targets are supported.");
  }
  if (target.username || target.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }
  if (target.port && !((target.protocol === "http:" && target.port === "80") ||
                       (target.protocol === "https:" && target.port === "443"))) {
    throw new Error("Only standard HTTP and HTTPS ports are allowed.");
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) === 6) {
    throw new Error("IPv6 targets are not supported by this scanner.");
  }
  if (net.isIP(hostname) === 4 && !isPublicIPv4(hostname)) {
    throw new Error("Private or special-use IP targets are blocked.");
  }
  return target;
}

async function resolvePublicTarget(input) {
  const target = normalizeTargetUrl(input);
  const hostname = target.hostname;
  const literalIp = net.isIP(hostname);
  const addresses = literalIp === 4 ? [hostname] : await dns.resolve4(hostname);
  if (!addresses.length || addresses.some((address) => !isPublicIPv4(address))) {
    throw new Error("Target resolves to a private or special-use address and is blocked.");
  }
  return { url: target, hostname, address: addresses[0] };
}

function createPinnedAgents(target) {
  const lookup = (_hostname, options, callback) => {
    if (options && options.all) {
      callback(null, [{ address: target.address, family: 4 }]);
      return;
    }
    callback(null, target.address, 4);
  };
  return {
    httpAgent: new http.Agent({ keepAlive: false, lookup }),
    httpsAgent: new https.Agent({ keepAlive: false, lookup }),
  };
}

module.exports = { createPinnedAgents, isPublicIPv4, normalizeTargetUrl, resolvePublicTarget };
