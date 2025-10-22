export default async function handler(req, res) {
  const type = req.query.type || "schedule"; // napr. standings, scoreboard, odds, players
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  let url = "";

  switch (type) {
    case "standings":
      url = "https://api-web.nhle.com/v1/standings/now";
      break;
    case "scoreboard":
      url = "https://api-web.nhle.com/v1/scoreboard/now";
      break;
    case "odds": {
      const daysForward = 7;
      const baseUrl = "https://api-web.nhle.com/v1/partner-game/CZ/now";
      const today = new Date();

      console.log(`💰 Načítavam kurzy NHL na ${daysForward} dní dopredu`);

      try {
        // 🧭 vytvoríme 7 fetchov paralelne
        const urls = [];
        for (let i = 0; i < daysForward; i++) {
          urls.push(fetch(baseUrl, { cache: "no-store" }));
        }

        const responses = await Promise.all(urls);
        const jsons = await Promise.all(
          responses.map(r => (r.ok ? r.json() : { games: [] }))
        );

        // 🔁 zlúčenie všetkých hier do jednej kolekcie
        const gamesMap = new Map();
        jsons.forEach(data => {
          (data.games || []).forEach(g => {
            gamesMap.set(g.gameId, g);
          });
        });

        const merged = { games: Array.from(gamesMap.values()) };

        console.log(`✅ Načítané ${merged.games.length} zápasov (do 7 dní vopred)`);

        res.status(200).json(merged);
      } catch (e) {
        console.error("❌ Chyba pri načítaní kurzov:", e);
        res.status(500).json({ error: e.message });
      }
      return;
    }

      break;
    case "watch":
      url = "https://api-web.nhle.com/v1/where-to-watch";
      break;
    case "players":
      url = "https://api.nhle.com/stats/rest/en/players";
      break;
    default:
      url = `https://api-web.nhle.com/v1/schedule/${date}`;
  }

  try {
    console.log("🟢 Fetchujem NHL endpoint:", url);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    console.log("💰 NHL sample:", JSON.stringify(data?.games?.[0] || data?.standings?.[0] || {}, null, 2));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (e) {
    console.error("❌ Chyba pri fetchnutí NHL API:", e.message);
    res.status(500).json({ error: e.message });
  }
}
