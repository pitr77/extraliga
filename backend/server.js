// backend/server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// === VERCEL PORT ===
const PORT = process.env.PORT || 3000;

// === Pre __dirname (Vercel ES Modules) ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// === KONŠTANTY PRE RATING A STRATÉGIU ===
const START_RATING = 1500;
const GOAL_POINTS = 10;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;
const PLAYER_GOAL_POINTS = 20;
const PLAYER_ASSIST_POINTS = 10;
const MANTINGALE_ODDS = 2.5;
const MANTINGALE_START_STAKE = 1;

// ======================================================
// ENDPOINT: /matches  (všetky zápasy + ratingy + mantingal)
// ======================================================
app.get("/matches", async (req, res) => {
  try {
    const scheduleUrl = "https://api-web.nhle.com/v1/schedule/now";
    const { data } = await axios.get(scheduleUrl);

    // extrahuj všetky zápasy z týždňa
    const allGames = (data?.gameWeek || []).flatMap(day => day.games || []);

    // len odohrané alebo naplánované zápasy
    const matches = allGames.filter(g =>
      ["FINAL", "LIVE", "FUT"].includes(g.gameState)
    );

    const teamRatings = {};
    const playerRatings = {};
    const martingaleState = new Map();
    let totalStaked = 0;
    let totalReturn = 0;
    const matchesWithStats = [];

    // =============================
    // Načítaj boxscore pre každý zápas
    // =============================
    for (const game of matches) {
      const gameId = game.id;
      let boxData = null;

      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const boxRes = await axios.get(boxUrl);
        boxData = boxRes.data;
      } catch {
        // niektoré zápasy ešte nemajú boxscore
      }

      const home = game.homeTeam?.commonName?.default || "Home";
      const away = game.awayTeam?.commonName?.default || "Away";
      const homeScore = boxData?.homeTeam?.score ?? 0;
      const awayScore = boxData?.awayTeam?.score ?? 0;

      matchesWithStats.push({
        id: gameId,
        date: game.startTimeUTC,
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: game.gameState,
        statistics: boxData,
      });

      // === RATING TÍMOV ===
      if (!teamRatings[home]) teamRatings[home] = START_RATING;
      if (!teamRatings[away]) teamRatings[away] = START_RATING;

      teamRatings[home] += homeScore * GOAL_POINTS - awayScore * GOAL_POINTS;
      teamRatings[away] += awayScore * GOAL_POINTS - homeScore * GOAL_POINTS;

      if (homeScore > awayScore) {
        teamRatings[home] += WIN_POINTS;
        teamRatings[away] += LOSS_POINTS;
      } else if (awayScore > homeScore) {
        teamRatings[away] += WIN_POINTS;
        teamRatings[home] += LOSS_POINTS;
      }

      // === RATING HRÁČOV ===
      const allPlayers = [
        ...(boxData?.homeTeam?.players || []),
        ...(boxData?.awayTeam?.players || []),
      ];

      for (const p of allPlayers) {
        const name = p?.person?.fullName;
        if (!name) continue;

        const goals = p?.stats?.skaterStats?.goals ?? 0;
        const assists = p?.stats?.skaterStats?.assists ?? 0;

        if (!playerRatings[name]) playerRatings[name] = START_RATING;
        playerRatings[name] += goals * PLAYER_GOAL_POINTS + assists * PLAYER_ASSIST_POINTS;
      }

      // === MANTINGAL ===
      const top3 = Object.entries(playerRatings)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      for (const playerName of top3) {
        if (!martingaleState.has(playerName)) {
          martingaleState.set(playerName, {
            stake: MANTINGALE_START_STAKE,
            lastOutcome: null,
          });
        }

        const s = martingaleState.get(playerName);
        totalStaked += s.stake;

        const playerStats = allPlayers.find(p => p?.person?.fullName === playerName);
        const scored = playerStats?.stats?.skaterStats?.goals > 0;

        if (scored) {
          totalReturn += s.stake * MANTINGALE_ODDS;
          martingaleState.set(playerName, {
            stake: MANTINGALE_START_STAKE,
            lastOutcome: "win",
          });
        } else {
          martingaleState.set(playerName, {
            stake: s.stake * 2,
            lastOutcome: "loss",
          });
        }
      }
    }

    // === Výsledný súhrn Mantingalu ===
    const martingaleSummary = {
      totalStaked: Number(totalStaked.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      profit: Number((totalReturn - totalStaked).toFixed(2)),
      odds: MANTINGALE_ODDS,
    };

    res.json({
      matches: matchesWithStats,
      teamRatings,
      playerRatings,
      martingale: { summary: martingaleSummary },
    });
  } catch (err) {
    console.error("❌ NHL API error:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát" });
  }
});

// ======================================================
// ENDPOINT: /match-details/:id
// ======================================================
app.get("/match-details/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const { data } = await axios.get(
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`
    );
    res.json(data);
  } catch (err) {
    console.error("❌ Chyba detailu zápasu:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní detailov zápasu" });
  }
});

// ======================================================
// SERVER START
// ======================================================
app.listen(PORT, () => {
  console.log(`🏒 NHL Server beží na porte ${PORT}`);
});

export default app;
