export async function handleWellKnown(request, env) {
  const { pathname } = new URL(request.url);

  switch (pathname) {
    case '/.well-known/jwks.json':
      return serveJwks(env);
    case '/.well-known/apple-app-site-association':
      return serveAasa(env);
    case '/.well-known/assetlinks.json':
      return serveAssetLinks(env);
    default:
      return new Response('Not found', { status: 404 });
  }
}

async function serveJwks(env) {
  const jwks = await env.PREVIEW_KEYS.get('jwks');
  if (!jwks) {
    return new Response('JWKS not configured — run scripts/generate-key.mjs', { status: 503 });
  }
  return json(jwks, { 'Cache-Control': 'max-age=3600' });
}

function serveAasa(env) {
  const aasa = {
    applinks: {
      details: [
        {
          appIDs: [env.APP_BUNDLE_ID],
          components: [
            {
              '/': '/preview',
              '?': { token: '?*' },
            },
          ],
        },
      ],
    },
  };
  return json(JSON.stringify(aasa), { 'Cache-Control': 'max-age=3600' });
}

function serveAssetLinks(env) {
  const links = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.ANDROID_PACKAGE,
        sha256_cert_fingerprints: [env.ANDROID_CERT_FINGERPRINT],
      },
    },
  ];
  return json(JSON.stringify(links), { 'Cache-Control': 'max-age=3600' });
}

function json(body, extraHeaders = {}) {
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
