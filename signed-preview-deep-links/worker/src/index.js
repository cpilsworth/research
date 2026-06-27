import { handleWellKnown } from './well-known.js';
import { handleSign } from './sign.js';
import { handleEnroll } from './enroll.js';
import { handlePreviewActivation, handleProxy } from './proxy.js';
import { serveUI } from './ui.js';
export { RateLimiter } from './rate-limit.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/' || pathname === '') {
      return serveUI();
    }

    if (pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }

    if (pathname.startsWith('/.well-known/')) {
      return handleWellKnown(request, env);
    }

    if (pathname === '/api/sign' && method === 'POST') {
      return handleSign(request, env);
    }

    if (pathname === '/api/enroll' && method === 'POST') {
      return handleEnroll(request, env);
    }

    // Universal Link activation — token delivered via query param.
    // iOS/Android intercepts this URL before the HTTP response is returned;
    // the response is served to browser fallback users.
    if (pathname === '/preview' && url.searchParams.has('token')) {
      return handlePreviewActivation(request, env);
    }

    // All other paths — proxy to preview or live origin based on session cookie.
    return handleProxy(request, env);
  },
};
