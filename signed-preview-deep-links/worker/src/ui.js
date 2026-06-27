const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview Signing Tool</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f1f5f9;
      --surface: #ffffff;
      --surface-2: #f8fafc;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --accent: #0ea5e9;
      --accent-hover: #0284c7;
      --success: #10b981;
      --error: #ef4444;
      --amber: #f59e0b;
      --amber-bg: #fffbeb;
      --amber-border: #fde68a;
      --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
      --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      --radius: 10px;
      --shadow: 0 1px 3px rgba(0,0,0,.07), 0 4px 16px rgba(0,0,0,.04);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --surface-2: #0f172a;
        --border: #334155;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --amber-bg: #1c1207;
        --amber-border: #78350f;
      }
    }

    body {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 16px 64px;
    }

    header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: var(--text);
    }

    .logo svg { color: var(--amber); flex-shrink: 0; }

    header p {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
      font-family: var(--mono);
    }

    main {
      max-width: 600px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 24px;
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--text-muted);
      margin-bottom: 14px;
    }

    .section-label + .section-label { margin-top: 22px; }

    .field { margin-bottom: 14px; }
    .field:last-of-type { margin-bottom: 0; }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 5px;
      color: var(--text-muted);
    }

    input, select {
      width: 100%;
      padding: 9px 11px;
      font-size: 14px;
      font-family: inherit;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      outline: none;
      transition: border-color .15s, box-shadow .15s;
      appearance: none;
      -webkit-appearance: none;
    }

    select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 30px;
    }

    input:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(14,165,233,.15);
    }

    input[type="password"] { font-family: var(--mono); letter-spacing: 0.06em; }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 110px;
      gap: 12px;
    }

    .row .field { margin-bottom: 0; }

    .submit-btn {
      width: 100%;
      padding: 11px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 20px;
      transition: background .15s, opacity .15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .submit-btn:hover:not(:disabled) { background: var(--accent-hover); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Result card */

    .result-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: var(--amber-bg);
      border: 1px solid var(--amber-border);
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .result-icon { font-size: 16px; line-height: 1.4; flex-shrink: 0; }

    .result-meta { font-size: 13px; color: var(--text-muted); line-height: 1.6; }
    .result-meta strong { color: var(--text); font-weight: 600; }

    .result-body {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 20px;
      align-items: start;
    }

    @media (max-width: 500px) {
      .result-body { grid-template-columns: 1fr; }
      #qr-wrap, #enroll-qr-wrap { display: flex; justify-content: center; }
    }

    #qr-img, #enroll-qr-img {
      display: block;
      border-radius: 8px;
      border: 1px solid var(--border);
      width: 172px;
      height: 172px;
    }

    #qr-fallback, #enroll-qr-fallback {
      width: 172px;
      text-align: center;
      padding: 20px 0;
    }

    .links { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

    .link-block {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 11px 12px;
    }

    .link-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--text-muted);
      margin-bottom: 5px;
    }

    .link-value {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text);
      word-break: break-all;
      line-height: 1.55;
      display: block;
      margin-bottom: 8px;
    }

    .copy-btn {
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      padding: 4px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text-muted);
      cursor: pointer;
      transition: background .1s, color .1s, border-color .1s;
    }

    .copy-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
    .copy-btn.copied { background: var(--success); color: #fff; border-color: var(--success); }

    /* Error */

    .error-banner {
      padding: 13px 15px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      font-size: 13px;
      color: var(--error);
      line-height: 1.5;
    }

    @media (prefers-color-scheme: dark) {
      .error-banner { background: #1c0a0a; border-color: #7f1d1d; }
    }

    [hidden] { display: none !important; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .65s linear infinite;
      flex-shrink: 0;
    }
  </style>
</head>
<body>

<header>
  <div class="logo">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
    Preview Signing Tool
  </div>
  <p>preview-proxy-worker.cpilsworth.workers.dev</p>
</header>

<main>

  <div class="card" id="error-card" hidden>
    <div class="error-banner" id="error-msg"></div>
  </div>

  <div class="card">
    <form id="mint-form" novalidate>

      <div class="section-label">Credentials</div>

      <div class="field">
        <label for="api-key">Signing API key</label>
        <input type="password" id="api-key" placeholder="••••••••••••••••"
               autocomplete="current-password" spellcheck="false" />
        <p class="hint">Admin key — mints tokens and enrolls authors. Stored in
          session storage. Leave blank to mint with a TOTP code instead.</p>
      </div>

      <div class="field">
        <label for="totp-code">TOTP code</label>
        <input type="text" id="totp-code" placeholder="123456"
               inputmode="numeric" autocomplete="one-time-code"
               maxlength="6" pattern="\\d{6}" spellcheck="false"
               style="font-family:var(--mono);letter-spacing:.3em;" />
        <p class="hint">6-digit code from your authenticator app. Used when the
          API key is blank (or has been removed). Requires the author email below.</p>
      </div>

      <div class="section-label">Token</div>

      <div class="field">
        <label for="path-select">Content path</label>
        <select id="path-select">
          <option value="/digi2/home">Home — /digi2/home</option>
          <option value="/digi2/invest">Invest — /digi2/invest</option>
          <option value="/digi2/trade">Trade — /digi2/trade</option>
          <option value="/digi2/accounts">Accounts — /digi2/accounts</option>
          <option value="custom">Custom path…</option>
        </select>
      </div>

      <div class="field" id="custom-field" hidden>
        <label for="custom-path">Custom path</label>
        <input type="text" id="custom-path" placeholder="/digi2/your-path" spellcheck="false" />
      </div>

      <div class="row">
        <div class="field">
          <label for="sub">Author email</label>
          <input type="email" id="sub" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label for="ttl">Expires (min)</label>
          <input type="number" id="ttl" value="60" min="1" max="1440" />
        </div>
      </div>

      <button type="submit" class="submit-btn" id="mint-btn">
        Mint preview token
      </button>

    </form>
  </div>

  <div class="card">
    <form id="enroll-form" novalidate>
      <div class="section-label">Enroll author for TOTP</div>
      <div class="row">
        <div class="field">
          <label for="enroll-sub">Author email</label>
          <input type="email" id="enroll-sub" placeholder="author@example.com" />
        </div>
        <div class="field" style="display:flex;align-items:flex-end;">
          <button type="submit" class="submit-btn" id="enroll-btn" style="margin-top:0;">
            Generate
          </button>
        </div>
      </div>
      <p class="hint">Uses the API key above as admin auth. Generates a TOTP
        secret, stores it for this author, and shows a QR to scan into an
        authenticator app.</p>
    </form>
  </div>

  <div class="card" id="enroll-result-card" hidden>
    <div class="result-banner">
      <span class="result-icon">🔐</span>
      <div class="result-meta">
        TOTP enrolled for <strong id="e-sub"></strong>
        <span id="e-replaced" hidden> &nbsp;·&nbsp; replaced an existing secret</span>
      </div>
    </div>
    <div class="result-body">
      <div id="enroll-qr-wrap">
        <img id="enroll-qr-img" alt="otpauth QR code" hidden />
        <p id="enroll-qr-fallback" class="hint" hidden>QR unavailable — enter the secret manually.</p>
      </div>
      <div class="links">
        <div class="link-block">
          <div class="link-label">Scan into authenticator app</div>
          <span class="link-value">Point Google Authenticator / 1Password / etc. at the QR, or add the secret manually.</span>
        </div>
        <div class="link-block">
          <div class="link-label">Secret · manual entry</div>
          <span class="link-value" id="e-secret"></span>
          <button class="copy-btn" data-target="e-secret">Copy</button>
        </div>
        <div class="link-block">
          <div class="link-label">otpauth URI</div>
          <span class="link-value" id="e-uri"></span>
          <button class="copy-btn" data-target="e-uri">Copy</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card" id="result-card" hidden>
    <div class="result-banner">
      <span class="result-icon">⌖</span>
      <div class="result-meta">
        Preview token for <strong id="r-path"></strong> &nbsp;·&nbsp;
        Expires <strong id="r-expires"></strong>
      </div>
    </div>
    <div class="result-body">
      <div id="qr-wrap">
        <img id="qr-img" alt="QR code" hidden />
        <p id="qr-fallback" class="hint" hidden>QR unavailable — use the link below.</p>
      </div>
      <div class="links">
        <div class="link-block">
          <div class="link-label">Universal Link · iOS &amp; Android</div>
          <span class="link-value" id="r-universal"></span>
          <button class="copy-btn" data-target="r-universal">Copy</button>
        </div>
        <div class="link-block">
          <div class="link-label">Simulator · custom scheme</div>
          <span class="link-value" id="r-sim"></span>
          <button class="copy-btn" data-target="r-sim">Copy</button>
        </div>
        <div class="link-block">
          <div class="link-label">Simulator · launch arg (no prompt)</div>
          <span class="link-value" id="r-launch"></span>
          <button class="copy-btn" data-target="r-launch">Copy</button>
        </div>
      </div>
    </div>
  </div>

</main>

<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
        onerror="window.__qrFailed=true"></script>
<script>
  const form       = document.getElementById('mint-form');
  const mintBtn    = document.getElementById('mint-btn');
  const resultCard = document.getElementById('result-card');
  const errorCard  = document.getElementById('error-card');
  const pathSelect = document.getElementById('path-select');
  const customField = document.getElementById('custom-field');
  const customInput = document.getElementById('custom-path');
  const apiKeyInput = document.getElementById('api-key');
  const totpInput = document.getElementById('totp-code');

  apiKeyInput.value = sessionStorage.getItem('preview-api-key') || '';

  pathSelect.addEventListener('change', () => {
    customField.hidden = pathSelect.value !== 'custom';
    if (!customField.hidden) customInput.focus();
  });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = document.getElementById(btn.dataset.target).textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
      });
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const key = apiKeyInput.value.trim();
    const totp = totpInput.value.trim();
    if (!key && !totp) {
      showError('Enter your signing API key, or a TOTP code to mint as an author.');
      return;
    }

    const path = pathSelect.value === 'custom'
      ? customInput.value.trim()
      : pathSelect.value;
    if (!path) { showError('Enter a content path.'); return; }

    const subRaw = document.getElementById('sub').value.trim();
    // In TOTP mode, sub selects which enrolled secret to check, so it's required.
    if (totp && !subRaw) {
      showError('Author email is required when minting with a TOTP code.');
      return;
    }
    const sub = subRaw || 'author@example.com';
    const ttl = parseInt(document.getElementById('ttl').value, 10) || 60;

    if (key) sessionStorage.setItem('preview-api-key', key);
    setLoading(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = 'Bearer ' + key;
      const reqBody = { path, sub, ttlMinutes: ttl };
      if (totp) reqBody.totp = totp;

      const res = await fetch('/api/sign', {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      });
      const body = await res.text();
      if (!res.ok) { showError(res.status + ' — ' + body); return; }
      // TOTP codes are single-window — clear after use so the next mint needs a fresh one.
      totpInput.value = '';
      await showResult(JSON.parse(body), path, ttl);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });

  async function showResult({ token, universalLink, expiresAt }, path, ttl) {
    const expiryTime = new Date(expiresAt)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    document.getElementById('r-path').textContent = path;
    document.getElementById('r-expires').textContent = expiryTime + ' (' + ttl + ' min)';
    document.getElementById('r-universal').textContent = universalLink;
    document.getElementById('r-sim').textContent = 'myapp://home?token=' + token;
    document.getElementById('r-launch').textContent =
      'xcrun simctl launch booted chrisp.ContentPreview -previewToken ' + token;

    renderQR('qr-img', 'qr-fallback', universalLink);

    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Render the given text as a QR into the <img>, or reveal the fallback <p>.
  function renderQR(imgId, fallbackId, text) {
    const img = document.getElementById(imgId);
    const fallback = document.getElementById(fallbackId);
    img.hidden = true;
    fallback.hidden = true;
    try {
      if (window.__qrFailed || typeof qrcode === 'undefined') {
        throw new Error('QR library not available');
      }
      // typeNumber 0 = auto-size to fit the data; 'M' = ~15% error correction.
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      img.src = qr.createDataURL(5, 8);
      img.hidden = false;
    } catch (_) {
      fallback.hidden = false;
    }
  }

  // --- TOTP enrollment ---

  const enrollForm = document.getElementById('enroll-form');
  const enrollBtn = document.getElementById('enroll-btn');
  const enrollResultCard = document.getElementById('enroll-result-card');

  enrollForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const key = apiKeyInput.value.trim();
    if (!key) { showError('Enter your signing API key first.'); return; }

    const sub = document.getElementById('enroll-sub').value.trim();
    if (!sub) { showError('Enter the author email to enroll.'); return; }

    sessionStorage.setItem('preview-api-key', key);
    enrollBtn.disabled = true;
    enrollBtn.innerHTML = '<span class="spinner"></span>Generating…';

    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sub }),
      });
      const body = await res.text();
      if (!res.ok) { showError(res.status + ' — ' + body); return; }
      showEnrollResult(JSON.parse(body));
    } catch (err) {
      showError(err.message);
    } finally {
      enrollBtn.disabled = false;
      enrollBtn.textContent = 'Generate';
    }
  });

  function showEnrollResult({ sub, secret, uri, replaced }) {
    document.getElementById('e-sub').textContent = sub;
    document.getElementById('e-replaced').hidden = !replaced;
    document.getElementById('e-secret').textContent = secret;
    document.getElementById('e-uri').textContent = uri;

    renderQR('enroll-qr-img', 'enroll-qr-fallback', uri);

    enrollResultCard.hidden = false;
    enrollResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setLoading(on) {
    mintBtn.disabled = on;
    mintBtn.innerHTML = on
      ? '<span class="spinner"></span>Minting…'
      : 'Mint preview token';
  }

  function showError(msg) {
    document.getElementById('error-msg').textContent = msg;
    errorCard.hidden = false;
    errorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() { errorCard.hidden = true; }
</script>
</body>
</html>`;

export function serveUI() {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
