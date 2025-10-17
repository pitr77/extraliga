// /api/matches.js

export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08"; // začiatok sezóny
    const TODAY = new Date().toISOString().slice(0, 10);

    const START_RATING = 1500;
    const GOAL_POINTS = 10;
    const WIN_POINTS = 10;
    const LOSS_POINTS = -10;

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
    const teamRatings = {};

    // --- Načítaj všetky dni ---
    for (const day of dateRange) {
      const url = `https://api-web.nhle.com/v1/score/${day}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      const games = data.games || [];
      for (const g of games) {
        const state = (g.gameState || "").toUpperCase();
        if (state === "FINAL" || state === "LIVE") {
          const homeTeam = g.homeTeam?.name?.default || "Domáci";
          const awayTeam = g.awayTeam?.name?.default || "Hostia";
          const homeScore = g.homeTeam?.score ?? 0;
          const awayScore = g.awayTeam?.score ?? 0;

          allMatches.push({
            id: g.id,
            date: day,
            status: state === "FINAL" ? "closed" : "ap",
            home_team: homeTeam,
            away_team: awayTeam,
            home_score: homeScore,
            away_score: awayScore,
            start_time: g.startTimeUTC,
          });

          // --- VÝPOČET RATINGOV ---
          if (!teamRatings[homeTeam]) teamRatings[homeTeam] = START_RATING;
          if (!teamRatings[awayTeam]) teamRatings[awayTeam] = START_RATING;

          // Góly
          teamRatings[homeTeam] += homeScore * GOAL_POINTS - awayScore * GOAL_POINTS;
          teamRatings[awayTeam] += awayScore * GOAL_POINTS - homeScore * GOAL_POINTS;

          // Výhra / prehra
          if (homeScore > awayScore) {
            teamRatings[homeTeam] += WIN_POINTS;
            teamRatings[awayTeam] += LOSS_POINTS;
          } else if (awayScore > homeScore) {
            teamRatings[awayTeam] += WIN_POINTS;
            teamRatings[homeTeam] += LOSS_POINTS;
          }
        }
      }
    }

    // --- Log výstup ---
    console.log(`✅ Načítaných ${allMatches.length} zápasov`);
    console.log(`✅ Spočítané ratingy tímov: ${Object.keys(teamRatings).length} tímov`);

    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings: {}, // hráčske ratingy zatiaľ nepočítame
    });
  } catch (err) {
    console.error("❌ Chyba pri fetchnutí NHL skóre:", err);
    res.status(500).json({ error: err.message });
  }
}
