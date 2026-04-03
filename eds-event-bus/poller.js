/**
 * Polls the EDS Admin API activity logs for new entries.
 * Cursor (last-seen timestamp) is stored in KV between invocations.
 *
 * API: GET https://admin.hlx.page/log/{org}/{site}/{ref}
 *   ?from=<iso>&to=<iso>  — time window
 *   &nextToken=<token>    — pagination
 */

const ADMIN_ORIGIN = 'https://admin.hlx.page';

/**
 * Fetch all new log entries for a site since the last cursor.
 * Returns { entries, cursor } where cursor should be persisted for the next run.
 *
 * @param {{org:string, site:string, ref:string}} site
 * @param {string|null} cursor  ISO timestamp from previous run (null = first run)
 * @param {string} authToken
 * @returns {Promise<{entries: object[], cursor: string|null}>}
 */
export async function poll(site, cursor, authToken) {
  const entries = [];
  let newCursor = cursor;
  let url = buildUrl(site, cursor);

  while (url) {
    const res = await fetch(url, {
      headers: authToken ? { authorization: `token ${authToken}` } : {},
    });
    if (!res.ok) throw new Error(`${site.org}/${site.site}: HTTP ${res.status}`);
    const data = await res.json();

    if (data.entries?.length) {
      entries.push(...data.entries);
    }
    if (data.to) newCursor = data.to;

    url = data.links?.next ?? null;
  }

  return { entries, cursor: newCursor };
}

function buildUrl(site, cursor) {
  const base = `${ADMIN_ORIGIN}/log/${site.org}/${site.site}/${site.ref}`;
  const params = new URLSearchParams();
  if (cursor) {
    params.set('from', cursor);
  } else {
    // first run: look back a short window
    params.set('since', '2m');
  }
  return `${base}?${params}`;
}
