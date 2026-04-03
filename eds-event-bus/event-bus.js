/**
 * Minimal pub/sub event bus.
 *
 * Subscribers register for a specific route (e.g. "live", "preview", "code")
 * or "*" for all events.  Each raw log entry is normalised into a lightweight
 * event object before dispatch.
 */

export class EventBus {
  #handlers = new Map(); // route -> Set<fn>

  /**
   * @param {string} route  "live" | "preview" | "code" | "*"
   * @param {(event: object) => void | Promise<void>} handler
   */
  on(route, handler) {
    if (!this.#handlers.has(route)) this.#handlers.set(route, new Set());
    this.#handlers.get(route).add(handler);
  }

  async emit(event) {
    const targets = [
      ...(this.#handlers.get(event.route) ?? []),
      ...(this.#handlers.get('*') ?? []),
    ];
    await Promise.allSettled(
      targets.map(async (fn) => {
        try {
          await fn(event);
        } catch (err) {
          console.error(`[event-bus] handler error for ${event.route}: ${err.message}`);
        }
      }),
    );
  }
}

/**
 * Turn a raw EDS log entry + site config into a normalised event.
 */
export function normalise(entry, site) {
  return {
    route: entry.route ?? 'custom',
    method: entry.method?.replace(',', ''), // API sometimes has trailing comma
    status: entry.status,
    path: entry.path ?? null,
    paths: entry.paths ?? (entry.path ? [entry.path] : []),
    user: entry.user ?? null,
    timestamp: new Date(entry.timestamp),
    duration: entry.duration ?? null,
    event: entry.event ?? null,
    org: site.org,
    site: site.site,
    ref: site.ref,
    raw: entry,
  };
}
