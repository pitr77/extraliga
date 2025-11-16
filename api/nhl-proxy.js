// api/nhl-proxy.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const type = url.searchParams.get("type") || "scoreboard";

    // === 1) najprv skús Upstash pre "standings"
    if (type === "standings" && redis) {
      const cached = await redis.get("nhl:standings");
      if (cached) {
        res.setHeader("x-source", "upstash");
        res.setHeader("Cache-Control", "s-maxage=30");
        res.status(200).json(cached);
        return;
      }
    }

    // === 2) inak live fetch (a uloženie do Upstash ako bonus)
    const endpoint = pickEndpoint(type);
    if (!endpoint) {
      res.status(400).json({ error: "Unknown type" });
      return;
    }

    const data = await cachedFetchJson(endpoint, 60_000);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

    // ak práve ťaháme standings live, ulož aj do Upstash (aby ďalší hit išiel z cache)
    if (type === "standings" && redis) {
      await redis.set("nhl:standings", data);
      await redis.set("nhl:standings:ts", new Date().toISOString());
      res.setHeader("x-source", "live→upstash");
    }

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

const CACHE = new Map();
const PENDING = new Map();

async function cachedFetchJson(url, ttlMs) {
  const now = Date.now();
  const hit = CACHE.get(url);
  if (hit && (now - hit.ts) < ttlMs) return hit.data;

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
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.nhl.com/" }
      });
      if (r.status === 429) {
        const wait = 300 * Math.pow(2, i) + Math.floor(Math.random() * 150);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      const wait = 300 * Math.pow(2, i) + Math.floor(Math.random() * 150);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error("Fetch failed");
}
