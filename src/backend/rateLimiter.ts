import { NextRequest } from 'next/server';

export class RateLimitError extends Error {
  public status = 429;
  public retryAfter: number;
  public headers: Record<string, string>;

  constructor(retryAfter: number) {
    super(
      `Too many PIN verification attempts from this network. Please retry in ${retryAfter} seconds.`
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.headers = { 'Retry-After': String(retryAfter) };
  }
}

export class IPRateLimiter {
  private maxRequests: number;
  private windowSeconds: number;
  private requests = new Map<string, number[]>();

  constructor(maxRequests: number = 5, windowSeconds: number = 300) {
    this.maxRequests = maxRequests;
    this.windowSeconds = windowSeconds;
  }

  public getClientIp(req?: NextRequest | Request | null): string {
    if (!req) return 'unknown';
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim() || 'unknown';
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
    return '127.0.0.1';
  }

  public checkRateLimit(req?: NextRequest | Request | null): void {
    const clientIp = this.getClientIp(req);
    const now = Date.now() / 1000;

    // Keep only timestamps within the last 5 minutes (300 seconds)
    const current = this.requests.get(clientIp) || [];
    const validTimestamps = current.filter((ts) => now - ts < this.windowSeconds);
    this.requests.set(clientIp, validTimestamps);

    if (validTimestamps.length >= this.maxRequests) {
      const retryAfter = Math.max(
        1,
        Math.floor(this.windowSeconds - (now - validTimestamps[0]))
      );
      throw new RateLimitError(retryAfter);
    }

    validTimestamps.push(now);
    this.requests.set(clientIp, validTimestamps);
  }
}

const globalForRateLimiter = globalThis as unknown as {
  pinIpLimiter?: IPRateLimiter;
};

if (!globalForRateLimiter.pinIpLimiter) {
  globalForRateLimiter.pinIpLimiter = new IPRateLimiter(5, 300);
}

export const pinIpLimiter = globalForRateLimiter.pinIpLimiter;
