import { FETCH_RATE_LIMIT_PER_MINUTE } from './protocol';

/**
 * Regex patterns that match private / reserved IP ranges that plugins must not
 * be able to reach.  Covers:
 *   10.x.x.x          — Class-A private
 *   172.16-31.x.x     — Class-B private
 *   192.168.x.x       — Class-C private
 *   169.254.x.x       — Link-local / cloud metadata (AWS IMDSv1, etc.)
 *   127.x.x.x         — IPv4 loopback
 *   0.x.x.x           — Reserved "this" network
 *   localhost          — Hostname alias for loopback
 *   ::1 / [::1]       — IPv6 loopback
 *   ::ffff:x.x.x.x    — IPv6-mapped IPv4 addresses
 *   [0:0:0:0:0:0:0:1] — Full-form IPv6 loopback
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^localhost$/i,
  /^\[?::1\]?$/,
  // IPv6-mapped IPv4 private ranges
  /^\[?::ffff:(10|127|0)\.\d{1,3}\.\d{1,3}\.\d{1,3}\]?$/i,
  /^\[?::ffff:192\.168\.\d{1,3}\.\d{1,3}\]?$/i,
  /^\[?::ffff:172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\]?$/i,
  /^\[?::ffff:169\.254\.\d{1,3}\.\d{1,3}\]?$/i,
  // Full-form IPv6 loopback
  /^\[?0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}:0{0,4}1?\]?$/,
];

/**
 * Convert a URL glob pattern (using `*` as wildcard) into a RegExp that
 * matches the full URL string.
 *
 * All regex special characters are escaped first, then literal `\*` (escaped
 * asterisks from the original `*`) are replaced with `.*`.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexStr}$`);
}

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
}

export class NetworkValidator {
  private readonly allowlistRegexes: RegExp[];
  /** Timestamps (ms) of successful requests in the current window. */
  private requestTimestamps: number[] = [];

  constructor(allowlist: string[]) {
    this.allowlistRegexes = allowlist.map(globToRegex);
  }

  /**
   * Returns `true` when the given URL is permitted by the allowlist and is not
   * targeting a private / reserved network address.
   *
   * Rules (evaluated in order):
   * 1. Empty allowlist → always false (no allowlist = no fetch)
   * 2. Invalid URL → false
   * 3. Private / reserved hostname → false
   * 4. URL must match at least one allowlist glob pattern
   */
  isUrlAllowed(url: string): boolean {
    // Rule 1 — empty allowlist blocks everything
    if (this.allowlistRegexes.length === 0) {
      return false;
    }

    // Rule 2 — must be a parseable URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    // Rule 3 — block private / reserved IP ranges and hostnames
    // Check the raw hostname
    const hostname = parsed.hostname;
    if (isPrivateHost(hostname)) {
      return false;
    }

    // Also block non-standard IP encodings (decimal, hex, octal)
    // by checking if the hostname is purely numeric (decimal IP like 2130706433)
    if (/^\d+$/.test(hostname)) {
      return false; // Decimal IP — block all (could resolve to private)
    }
    if (/^0x[0-9a-f]+$/i.test(hostname)) {
      return false; // Hex IP
    }
    if (/^0\d+/.test(hostname)) {
      return false; // Octal IP
    }

    // Only allow http: and https: schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Rule 4 — URL must match at least one allowlist pattern
    return this.allowlistRegexes.some((re) => re.test(url));
  }

  /**
   * Sliding-window rate limiter: allows at most `FETCH_RATE_LIMIT_PER_MINUTE`
   * requests per 60-second window.
   *
   * Returns `true` (and records the request) when the request is within the
   * limit.  Returns `false` without recording when the limit is exceeded.
   */
  checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Evict timestamps outside the current window
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => ts > windowStart,
    );

    if (this.requestTimestamps.length >= FETCH_RATE_LIMIT_PER_MINUTE) {
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }
}
