const API = 'https://api.github.com';
const RETRY_DELAYS = [2000, 4000, 8000];
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
  searchIntervalMs = 2100,
} = {}) {
  const stats = { requests: 0 };
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
        res = await fetchImpl(url, init);
      } catch (err) {
        if (!canRetry) throw err;
        log(`ağ hatası (${err.message}), tekrar denenecek: ${method} ${url}`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      if (res.status === 404) return null;
      const retryAfter = Number(res.headers.get('retry-after'));
      const limited = res.status === 429
        || (res.status === 403 && (retryAfter > 0 || res.headers.get('x-ratelimit-remaining') === '0'));
      if ((res.status >= 500 || limited) && canRetry) {
        log(`${res.status}, tekrar denenecek: ${method} ${url}`);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS[attempt]);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
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
