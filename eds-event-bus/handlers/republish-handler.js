/**
 * Handler: when a page is published (route=live, method=POST),
 * republish related pages — possibly on a different site.
 *
 * Rules are plain objects with string patterns (not RegExp) so they can
 * live in wrangler.toml vars.
 */

const ADMIN_ORIGIN = 'https://admin.hlx.page';

/**
 * @typedef {object} RepublishRule
 * @property {string} match  - regex pattern string to match against published paths
 * @property {Array<{org:string, site:string, ref?:string, path:string}>} targets
 */

/**
 * @param {RepublishRule[]} rules
 * @param {string} [authToken]
 * @returns {(event:object)=>Promise<void>}
 */
export function createRepublishHandler(rules, authToken) {
  return async (event) => {
    if (event.route !== 'live' || event.method !== 'POST') return;

    for (const sourcePath of event.paths) {
      for (const rule of rules) {
        const pattern = new RegExp(rule.match);
        if (!pattern.test(sourcePath)) continue;

        for (const target of rule.targets) {
          const ref = target.ref ?? 'main';
          const url = `${ADMIN_ORIGIN}/live/${target.org}/${target.site}/${ref}${target.path}`;
          console.log(`[republish] ${sourcePath} -> ${target.org}/${target.site}${target.path}`);
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: authToken ? { authorization: `token ${authToken}` } : {},
            });
            if (!res.ok) {
              console.error(`[republish] failed ${url}: HTTP ${res.status}`);
            }
          } catch (err) {
            console.error(`[republish] error ${url}: ${err.message}`);
          }
        }
      }
    }
  };
}
