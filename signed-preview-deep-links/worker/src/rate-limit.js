const LIMIT = 10;       // max tokens per author per window
const WINDOW_SECS = 60; // sliding window in seconds

/**
 * Durable Object that enforces a per-author token-minting rate limit.
 * One DO instance is created per author ID (derived in sign.js).
 */
export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const now = Math.floor(Date.now() / 1000);

    // Retrieve sliding window state; initialise on first use.
    let { count = 0, windowStart = now } =
      (await this.state.storage.get('rl')) ?? {};

    if (now - windowStart >= WINDOW_SECS) {
      count = 0;
      windowStart = now;
    }

    if (count >= LIMIT) {
      const retryAfter = WINDOW_SECS - (now - windowStart);
      return Response.json({ allowed: false, retryAfter });
    }

    count++;
    await this.state.storage.put('rl', { count, windowStart });
    return Response.json({ allowed: true, retryAfter: 0 });
  }
}
