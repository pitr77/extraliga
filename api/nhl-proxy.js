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
    case "odds":
      url = "https://api-web.nhle.com/v1/partner-game/US/now";
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
    const r = await fetch(url);
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
