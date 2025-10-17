// /api/matches.js
export default async function handler(req, res) {
  try {
    // --- Nastavenie rozsahu dátumov (od začiatku sezóny po dnes) ---
    const START_DATE = "2025-10-08";
    const TODAY = new Date().toISOString().slice(0, 10);

    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // vygeneruj pole dní
    const dateRange = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRange.push(formatDate(new Date(d)));
    }

    // výsledné výstupy
    const allMatches = [];

    // --- interné akumulátory ratingov ---
    // tímy
    const teamRatings = {};
    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    // hráči (zo VŠETKÝCH boxscore od 8.10.2025)
    const playerRatings = {};
    const START_PLAYER_RATING = 1500;
    const GOAL_POINTS = 20;
    const ASSIST_POINTS = 10;

    const ensureTeam = (name) => {
      if (name == null) return;
      if (teamRatings[name] == null) teamRatings[name] = START_TEAM_RATING;
    };

    // Pomocník: bezpečne vyber meno hráča z boxscore záznamu
    const pickPlayerName = (p) => {
      // API často dáva name.default typu "J. Drouin"
      return (
        p?.name?.default ||
        [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim() ||
        "Neznámy hráč"
      );
    };

    // Pomocník: z team časti boxscore vyber skaterov (forwards + defense)
    const extractSkaters = (teamNode) => {
      const forwards = Array.isArray(teamNode?.forwards) ? teamNode.forwards : [];
      const defense = Array.isArray(teamNode?.defense) ? teamNode.defense : [];
      return [...forwards, ...defense];
    };

    // --- pre každý deň načítaj scoreboard a priprav si boxscore fetchy ---
    const boxscoreJobs = []; // funkcie (promisy) na neskoršie spustenie s limitom
    for (const day of dateRange) {
      const url = `https://api-web.nhle.com/v1/score/${day}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();

        const games = data.games || [];
        for (const g of games) {
          const state = String(g.gameState || "").toUpperCase();

          // berieme FINAL / OFF (ukončené) + LIVE (ak by si chcel rátať počas hry)
          if (!["FINAL", "OFF", "LIVE"].includes(state)) continue;

          // ulož do matches presne v tvare, ktorý tvoj FE používa
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

          // priebežný výpočet ratingu tímov (z gólov a výsledku)
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

          // ak je zápas ukončený, zaradíme boxscore job pre hráčov
          if (["FINAL", "OFF"].includes(state)) {
            const gameId = g.id;
            boxscoreJobs.push(async () => {
              try {
                const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
                const r = await fetch(boxUrl);
                if (!r.ok) return;

                const box = await r.json();

                // domáci + hostia
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
              } catch (e) {
                // pre istotu ticho ignoruj daný zápas (boxscore občas vráti 404)
              }
            });
          }
        }
      } catch (e) {
        // pokračuj ďalším dňom
      }
    }

    // --- spusti boxscore fetchy s limiterom (aby backend nebol pomalý) ---
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

    console.log(
      `✅ Zápasy: ${allMatches.length} | Hráči s ratingom: ${Object.keys(playerRatings).length}`
    );

    // odpoveď pre FE – zachovávam presnú štruktúru ako doteraz
    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings,
    });
  } catch (err) {
    console.error("❌ Chyba pri /api/matches:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
