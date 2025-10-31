// api/nhl-proxy.js
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const type = url.searchParams.get("type") || "scoreboard";

    const endpoint = pickEndpoint(type);
    if (!endpoint) {
      res.status(400).json({ error: "Unknown type" });
      return;
    }

    const data = await cachedFetchJson(endpoint, 60_000); // 60 s cache
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json(data);
  } catch (e) {
    console.error("❌ Proxy error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}

// ---- helpers ----

function pickEndpoint(type) {
  switch (type) {
    case "standings":  return "https://api-web.nhle.com/v1/standings/now";
    case "scoreboard": return "https://api-web.nhle.com/v1/scoreboard/now";
    case "watch":      return "https://api-web.nhle.com/v1/where-to-watch";
    case "players":    return "https://api.nhle.com/stats/rest/en/players";
    case "odds":       return "https://api-web.nhle.com/v1/partner-game/CZ/now";
    default:           return null;
  }
}

const CACHE = new Map();   // key -> {ts, data}
const PENDING = new Map(); // key -> Promise

async function cachedFetchJson(url, ttlMs) {
  const now = Date.now();
  const hit = CACHE.get(url);
  if (hit && (now - hit.ts) < ttlMs) return hit.data;

  // collapse concurrent requests to the same URL
  const pending = PENDING.get(url);
  if (pending) return pending;

  const p = (async () => {
    const data = await fetchWithRetry(url, 3);
    CACHE.set(url, { ts: Date.now(), data });
    PENDING.delete(url);
    return data;
  })();

  PENDING.set(url, p);
  return p;
}

async function fetchWithRetry(url, maxAttempts = 3) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          // niektoré NHL endpointy sú citlivé na UA/Referer
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://www.nhl.com/"
        }
      });
      if (r.status === 429) {
        const wait = 300 * Math.pow(2, i) + Math.floor(Math.random() * 150);
        await delay(wait);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      const wait = 300 * Math.pow(2, i) + Math.floor(Math.random() * 150);
      await delay(wait);
    }
  }
  throw lastErr || new Error("Fetch failed");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
