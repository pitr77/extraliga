// /api/nhl.js

export default async function handler(req, res) {
  const { type } = req.query;

  const endpoints = {
    standings: "https://api-web.nhle.com/v1/standings/now",
    scoreboard: "https://api-web.nhle.com/v1/scoreboard/now",
    odds: "https://api-web.nhle.com/v1/partner-game/CZ/now",
    watch: "https://api-web.nhle.com/v1/where-to-watch",
    players: "https://api.nhle.com/stats/rest/en/players",
  };

  const url = endpoints[type];
  if (!url) return res.status(400).json({ error: "Unknown NHL API type" });

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
