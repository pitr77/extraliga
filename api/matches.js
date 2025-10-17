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
    const teamRatings = {};
    const playerRatings = {};

    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    const START_PLAYER_RATING = 1500;
    const GOAL_POINTS = 20;
    const ASSIST_POINTS = 10;

    const ensureTeam = (name) => {
      if (name && teamRatings[name] == null) teamRatings[name] = START_TEAM_RATING;
    };

    const pickPlayerName = (p) =>
      p?.name?.default ||
      [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim() ||
      "Neznámy hráč";

    const extractSkaters = (teamNode) => [
      ...(Array.isArray(teamNode?.forwards) ? teamNode.forwards : []),
      ...(Array.isArray(teamNode?.defense) ? teamNode.defense : []),
    ];

    const boxscoreJobs = [];
    for (const day of dateRange) {
      try {
        const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (!resp.ok) continue;
        const data = await resp.json();

        const games = data.games || [];
        for (const g of games) {
          const state = String(g.gameState || "").toUpperCase();
          if (!["FINAL", "OFF", "LIVE"].includes(state)) continue;

          const match = {
            id: g.id,
            date: day,
            status: state === "LIVE" ? "ap" : "closed",
            home_team: g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home",
            away_team: g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away",
            home_score: g.homeTeam?.score ?? 0,
            away_score: g.awayTeam?.score ?? 0,
            start_time: g.startTimeUTC,
          };
          allMatches.push(match);

          ensureTeam(match.home_team);
          ensureTeam(match.away_team);

          const hs = match.home_score ?? 0;
          const as = match.away_score ?? 0;

          teamRatings[match.home_team] += hs * TEAM_GOAL_POINTS - as * TEAM_GOAL_POINTS;
          teamRatings[match.away_team] += as * TEAM_GOAL_POINTS - hs * TEAM_GOAL_POINTS;

          if (hs > as) {
            teamRatings[match.home_team] += TEAM_WIN_POINTS;
            teamRatings[match.away_team] += TEAM_LOSS_POINTS;
          } else if (as > hs) {
            teamRatings[match.away_team] += TEAM_WIN_POINTS;
            teamRatings[match.home_team] += TEAM_LOSS_POINTS;
          }

          if (["FINAL", "OFF"].includes(state)) {
            const gameId = g.id;
            boxscoreJobs.push(async () => {
              try {
                const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
                if (!r.ok) return;
                const box = await r.json();

                const homeSkaters = extractSkaters(box?.playerByGameStats?.homeTeam || {});
                const awaySkaters = extractSkaters(box?.playerByGameStats?.awayTeam || {});
                const allSkaters = [...homeSkaters, ...awaySkaters];

                for (const p of allSkaters) {
                  const name = pickPlayerName(p);
                  if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;
                  const goals = Number(p.goals || 0);
                  const assists = Number(p.assists || 0);
                  playerRatings[name] += goals * GOAL_POINTS + assists * ASSIST_POINTS;
                }
              } catch {}
            });
          }
        }
      } catch {}
    }

    // obmedzenie paralelných volaní
    const CONCURRENCY = 6;
    const runWithLimit = async (jobs, limit) => {
      const queue = jobs.slice();
      const workers = Array(Math.min(limit, queue.length))
        .fill(0)
        .map(async () => {
          while (queue.length) {
            const job = queue.shift();
            await job();
          }
        });
      await Promise.all(workers);
    };
    await runWithLimit(boxscoreJobs, CONCURRENCY);

    // ---- nový krok: vyber TOP 50 hráčov podľa ratingu ----
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = rating;
        return acc;
      }, {});

    console.log(
      `✅ Zápasy: ${allMatches.length} | Tímy: ${Object.keys(teamRatings).length} | TOP hráči: ${Object.keys(topPlayers).length}`
    );

    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings: topPlayers, // len TOP 50 hráčov
    });
  } catch (err) {
    console.error("❌ Chyba pri /api/matches:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
