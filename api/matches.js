// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08";
    const TODAY = new Date();
    const formatDate = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const dateRange = [];
    for (let d = new Date(START_DATE); d <= TODAY; d.setDate(d.getDate() + 1)) {
      dateRange.push(formatDate(new Date(d)));
    }

    const allMatches = [];
    const teamRatings = {};
    const playerRatings = {};

    // === KONŠTANTY ===
    const START_RATING = 1500;
    const GOAL_POINTS = 10;
    const WIN_POINTS = 10;
    const LOSS_POINTS = -10;
    const PLAYER_GOAL_POINTS = 20;
    const PLAYER_ASSIST_POINTS = 10;

    // === 1️⃣ NAČÍTANIE ZÁPASOV (score/{date}) ===
    for (const day of dateRange) {
      const url = `https://api-web.nhle.com/v1/score/${day}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const games = data.games || [];

      for (const g of games) {
        const state = (g.gameState || "").toUpperCase();
        if (!["FINAL", "OFF"].includes(state)) continue;

        const home = g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home";
        const away = g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away";
        const hs = g.homeTeam?.score ?? 0;
        const as = g.awayTeam?.score ?? 0;

        allMatches.push({
          id: g.id, // dôležité pre boxscore
          date: day,
          status: "closed",
          home_team: home,
          away_team: away,
          home_score: hs,
          away_score: as,
          start_time: g.startTimeUTC,
        });

        // === výpočet tímových ratingov ===
        if (!teamRatings[home]) teamRatings[home] = START_RATING;
        if (!teamRatings[away]) teamRatings[away] = START_RATING;

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
    }

    // === 2️⃣ BOX SCORES PRE POSLEDNÉ 3 DNI ===
    const recentMatches = allMatches.slice(-30);
    for (const match of recentMatches) {
      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${match.id}/boxscore`;
        const boxResp = await fetch(boxUrl);
        if (!boxResp.ok) continue;
        const boxData = await boxResp.json();

        // home & away hráči
        const homePlayers = [
          ...(boxData.playerByGameStats?.homeTeam?.forwards || []),
          ...(boxData.playerByGameStats?.homeTeam?.defense || []),
        ];
        const awayPlayers = [
          ...(boxData.playerByGameStats?.awayTeam?.forwards || []),
          ...(boxData.playerByGameStats?.awayTeam?.defense || []),
        ];
        const allPlayers = [...homePlayers, ...awayPlayers];

        // pre každý zápas pripočítaj hráčom ich body
        for (const p of allPlayers) {
          const name = p.name?.default || "Neznámy hráč";
          const goals = p.goals ?? 0;
          const assists = p.assists ?? 0;

          if (goals === 0 && assists === 0) continue;

          if (!playerRatings[name]) playerRatings[name] = 1500;
          playerRatings[name] += goals * PLAYER_GOAL_POINTS + assists * PLAYER_ASSIST_POINTS;
        }

        console.log(`✅ Spracovaný boxscore zápasu ${match.id}`);
      } catch (e) {
        console.warn(`⚠️ Chyba pri boxscore zápase ${match.id}: ${e.message}`);
      }
    }

    console.log(
      `✅ Hotovo: zápasy=${allMatches.length}, tímy=${Object.keys(teamRatings).length}, hráči=${Object.keys(playerRatings).length}`
    );

    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings,
    });
  } catch (err) {
    console.error("❌ Chyba backendu:", err);
    res.status(500).json({ error: err.message });
  }
}
