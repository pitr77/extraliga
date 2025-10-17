// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08";
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
        if (["FINAL", "LIVE", "OFF"].includes(state)) {
          allMatches.push({
            id: g.id,
            date: day,
            status:
              state === "FINAL" || state === "OFF"
                ? "closed"
                : state === "LIVE"
                ? "ap"
                : "not_started",
            home_team: g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home",
            away_team: g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away",
            home_score: g.homeTeam?.score ?? 0,
            away_score: g.awayTeam?.score ?? 0,
            start_time: g.startTimeUTC,
            goals: g.goals || [] // 🆕 uložíme aj góly pre hráčske štatistiky
          });
        }
      }
    }

    console.log(`✅ Načítaných ${allMatches.length} zápasov s výsledkami`);

    // === Výpočet ratingov tímov ===
    const START_RATING = 1500;
    const GOAL_POINTS = 10;
    const WIN_POINTS = 10;
    const LOSS_POINTS = -10;

    const teamRatings = {};
    const ensureTeam = (team) => {
      if (teamRatings[team] == null) teamRatings[team] = START_RATING;
    };

    for (const m of allMatches) {
      const home = m.home_team;
      const away = m.away_team;
      const hs = m.home_score ?? 0;
      const as = m.away_score ?? 0;

      ensureTeam(home);
      ensureTeam(away);

      teamRatings[home] += hs * GOAL_POINTS - as * GOAL_POINTS;
      teamRatings[away] += as * GOAL_POINTS - hs * GOAL_POINTS;

      if (hs > as) {
        teamRatings[home] += WIN_POINTS;
        teamRatings[away] += LOSS_POINTS;
      } else if (as > hs) {
        teamRatings[away] += WIN_POINTS;
        teamRatings[home] += LOSS_POINTS;
      }
    }

    // === 🆕 Výpočet ratingov hráčov ===
    const PLAYER_GOAL_POINTS = 20;
    const PLAYER_ASSIST_POINTS = 10;
    const playerRatings = {};

    for (const match of allMatches) {
      const goals = match.goals || [];
      for (const goal of goals) {
        const scorer = goal.name?.default || goal.name || "Neznámy hráč";
        if (scorer) {
          if (!playerRatings[scorer]) playerRatings[scorer] = 0;
          playerRatings[scorer] += PLAYER_GOAL_POINTS;
        }

        const assists = goal.assists || [];
        assists.forEach((a) => {
          const asstName = a.name?.default || a.name || "Asistent";
          if (!playerRatings[asstName]) playerRatings[asstName] = 0;
          playerRatings[asstName] += PLAYER_ASSIST_POINTS;
        });
      }
    }

    // zoradenie pre kontrolu
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.log("⭐ TOP 5 hráčov podľa ratingu:", topPlayers);

    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings,
    });
  } catch (err) {
    console.error("❌ Chyba pri fetchnutí NHL skóre:", err);
    res.status(500).json({ error: err.message });
  }
}
