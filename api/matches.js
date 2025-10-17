// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08"; // začiatok sezóny
    const TODAY = new Date().toISOString().slice(0, 10);

    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const dateRange = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRange.push(formatDate(new Date(d)));
    }

    const allMatches = [];

    for (const day of dateRange) {
      const url = `https://api-web.nhle.com/v1/score/${day}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      const games = data.games || [];
      for (const g of games) {
        const state = (g.gameState || "").toUpperCase();
        if (state === "FINAL" || state === "LIVE") {
          allMatches.push({
            id: g.id,
            date: day,
            status: state === "FINAL" ? "closed" : "ap",
            home_team: g.homeTeam.name.default,
            away_team: g.awayTeam.name.default,
            home_score: g.homeTeam.score,
            away_score: g.awayTeam.score,
            start_time: g.startTimeUTC,
          });
        }
      }
    }

    console.log(`✅ Načítaných ${allMatches.length} zápasov s výsledkami`);

    res.status(200).json({
      matches: allMatches,
      teamRatings: {},
      playerRatings: {},
    });
  } catch (err) {
    console.error("❌ Chyba pri fetchnutí NHL skóre:", err);
    res.status(500).json({ error: err.message });
  }
}
