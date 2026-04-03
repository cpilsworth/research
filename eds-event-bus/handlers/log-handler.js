/**
 * Simple logging handler — prints every event to the Worker log (visible in
 * `wrangler tail` or the CF dashboard).
 */
export function logHandler(event) {
  const paths = event.paths.join(', ') || '(none)';
  console.log(
    `[${event.timestamp.toISOString()}] ${event.route} ${event.method ?? ''} ${event.org}/${event.site} ${paths}`,
  );
}
