import { poll } from './poller.js';
import { EventBus, normalise } from './event-bus.js';
import { logHandler } from './handlers/log-handler.js';
import { createRepublishHandler } from './handlers/republish-handler.js';

export default {
  /**
   * Cron trigger — runs on the schedule defined in wrangler.toml.
   * Polls each configured site for new log entries and dispatches events.
   */
  async scheduled(event, env) {
    const sites = JSON.parse(env.SITES); // [{ org, site, ref }]
    const rules = JSON.parse(env.REPUBLISH_RULES || '[]');
    const authToken = env.EDS_AUTH_TOKEN || '';

    // Set up event bus
    const bus = new EventBus();
    bus.on('*', logHandler);
    if (rules.length) {
      bus.on('live', createRepublishHandler(rules, authToken));
    }

    // Poll each site, using KV for cursor persistence
    await Promise.allSettled(
      sites.map(async (siteConfig) => {
        const site = { ref: 'main', ...siteConfig };
        const kvKey = `cursor:${site.org}/${site.site}/${site.ref}`;

        try {
          const cursor = await env.EDS_CURSORS.get(kvKey);
          const result = await poll(site, cursor, authToken);

          // Persist the new cursor
          if (result.cursor) {
            await env.EDS_CURSORS.put(kvKey, result.cursor);
          }

          // Dispatch events
          for (const entry of result.entries) {
            await bus.emit(normalise(entry, site));
          }

          if (result.entries.length) {
            console.log(`${site.org}/${site.site}: ${result.entries.length} new entries`);
          }
        } catch (err) {
          console.error(`[poller] ${site.org}/${site.site}: ${err.message}`);
        }
      }),
    );
  },
};
