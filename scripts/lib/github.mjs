const API = 'https://api.github.com';
const RETRY_DELAYS = [2000, 4000, 8000];
const SECONDARY_WAIT_MS = 60000;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createClient({
  token,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = (m) => console.error(m),
  searchIntervalMs = 3000,
  now = () => Date.now(),
} = {}) {
  const stats = { requests: 0, remaining: Infinity };
  let lastSearch = 0;

  async function request(path, { method = 'GET', body, raw = false } = {}) {
    const url = path.startsWith('https://') ? path : API + path;
    const headers = {
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'katki-radar',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < RETRY_DELAYS.length;
      stats.requests++;
      let res;
      try {
        res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30000) });
      } catch (err) {
        if (!canRetry) throw err;
        log(`ağ hatası (${err.message}), tekrar denenecek: ${method} ${url}`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      const remainingHeader = res.headers.get('x-ratelimit-remaining');
      if (!path.startsWith('/search/') && remainingHeader !== null) {
        stats.remaining = Number(remainingHeader);
      }
      if (res.status === 404) return null;
      if ((res.status === 403 || res.status === 429) && remainingHeader === '0') {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const wait = reset * 1000 - now() + 1000;
        if (canRetry && wait > 0 && wait <= 300000) {
          log(`birincil hız sınırı, tekrar denenecek: ${method} ${url}`);
          await sleep(wait);
          continue;
        }
        const text = await res.text();
        throw new GitHubError(res.status, `${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      let limited = res.status === 429
        || (res.status === 403 && retryAfter > 0);
      let secondaryLimit = false;
      let bodyText;
      if (!limited && res.status === 403) {
        // GitHub's secondary rate limit often omits retry-after and x-ratelimit-remaining;
        // it only shows up in the body, so we have to read it to detect it.
        bodyText = await res.text();
        if (/secondary rate limit/i.test(bodyText)) {
          limited = true;
          secondaryLimit = true;
        }
      }
      if ((res.status >= 500 || limited) && canRetry) {
        log(`${res.status}, tekrar denenecek: ${method} ${url}`);
        const wait = retryAfter > 0 ? retryAfter * 1000 : (secondaryLimit ? SECONDARY_WAIT_MS : RETRY_DELAYS[attempt]);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const text = bodyText !== undefined ? bodyText : await res.text();
        throw new GitHubError(res.status, `${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
      }
      if (res.status === 204) return null;
      return raw ? res.text() : res.json();
    }
  }

  async function search(kind, q, { perPage = 10, sort } = {}) {
    const wait = lastSearch + searchIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastSearch = Date.now();
    const params = `q=${encodeURIComponent(q)}&per_page=${perPage}` + (sort ? `&sort=${sort}&order=desc` : '');
    const data = await request(`/search/${kind}?${params}`);
    return data?.items ?? [];
  }

  return { request, search, stats };
}
