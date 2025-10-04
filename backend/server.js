import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// --- pre __dirname (v ES modules) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- konfigurácia ---
const API_KEY = "WaNt9YL5305o4hT2iGrsnoxUhegUG0St1ZYcs11g";
const SEASON_ID = "sr:season:131005"; // Extraliga 25/26

// rating – tímy
const START_RATING = 1500;
const GOAL_POINTS = 10;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;

// rating – hráči
const PLAYER_GOAL_POINTS = 20;
const PLAYER_ASSIST_POINTS = 10;

// Mantingal
const MANTINGALE_ODDS = 2.5;
const MANTINGALE_START_STAKE = 1;

app.use(cors());
app.use(express.json());

// 👉 sprístupní frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ====================== ENDPOINTY ======================

// všetky zápasy + ratingy + Mantingal simulácia
app.get("/api/matches", async (req, res) => {
  try {
    const url = `https://api.sportradar.com/icehockey/trial/v2/en/seasons/${SEASON_ID}/summaries.json?api_key=${API_KEY}`;
    const response = await axios.get(url);
    const matches = response.data.summaries || [];

    const ordered = sortByStartTimeAsc(matches);

    const teamRatings = {};
    const playerRatingsById = {};
    const playerNamesById = {};

    const martingaleState = new Map();
    let totalStaked = 0;
    let totalReturn = 0;

    const getMatchPlayers = (match) => {
      const list = [];
      const comps = match?.statistics?.totals?.competitors || [];
      comps.forEach(team => {
        (team.players || []).forEach(p => {
          if (p?.id) {
            playerNamesById[p.id] = p.name;
            list.push(p);
          }
        });
      });
      return list;
    };

    for (const match of ordered) {
      const status = match?.sport_event_status?.status;
      if (status !== "closed" && status !== "ap") continue;

      const currentTop3 = Object.entries(playerRatingsById)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      const matchPlayers = getMatchPlayers(match);
      const playersInMatchIds = new Set(matchPlayers.map(p => p.id));

      currentTop3.forEach(pid => {
        if (playersInMatchIds.has(pid)) {
          if (!martingaleState.has(pid)) {
            martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: null });
          }
          const state = martingaleState.get(pid);
          totalStaked += state.stake;
        }
      });

      const goalsById = new Map();
      matchPlayers.forEach(p => {
        const g = p?.statistics?.goals ?? 0;
        if (g > 0) goalsById.set(p.id, g);
      });

      currentTop3.forEach(pid => {
        if (!playersInMatchIds.has(pid)) return;

        const state = martingaleState.get(pid);
        const scored = goalsById.has(pid);

        if (scored) {
          totalReturn += state.stake * MANTINGALE_ODDS;
          martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: "win" });
        } else {
          martingaleState.set(pid, { stake: state.stake * 2, lastOutcome: "loss" });
        }
      });

      const home = match.sport_event.competitors[0];
      const away = match.sport_event.competitors[1];
      const homeName = home.name;
      const awayName = away.name;

      const homeScore = match.sport_event_status.home_score ?? 0;
      const awayScore = match.sport_event_status.away_score ?? 0;

      if (!teamRatings[homeName]) teamRatings[homeName] = START_RATING;
      if (!teamRatings[awayName]) teamRatings[awayName] = START_RATING;

      teamRatings[homeName] += homeScore * GOAL_POINTS - awayScore * GOAL_POINTS;
      teamRatings[awayName] += awayScore * GOAL_POINTS - homeScore * GOAL_POINTS;

      if (homeScore > awayScore) {
        teamRatings[homeName] += WIN_POINTS;
        teamRatings[awayName] += LOSS_POINTS;
      } else if (awayScore > homeScore) {
        teamRatings[awayName] += WIN_POINTS;
        teamRatings[homeName] += LOSS_POINTS;
      }

      const comps = match?.statistics?.totals?.competitors || [];
      comps.forEach(team => {
        (team.players || []).forEach(player => {
          const pid = player.id;
          const name = player.name;
          if (!pid) return;

          playerNamesById[pid] = name;
          if (playerRatingsById[pid] == null) playerRatingsById[pid] = START_RATING;

          const g = player?.statistics?.goals ?? 0;
          const a = player?.statistics?.assists ?? 0;
          playerRatingsById[pid] += g * PLAYER_GOAL_POINTS + a * PLAYER_ASSIST_POINTS;
        });
      });
    }

    const playerRatingsByName = {};
    Object.entries(playerRatingsById).forEach(([pid, rating]) => {
      const name = playerNamesById[pid] || pid;
      playerRatingsByName[name] = rating;
    });

    const nowTop3Ids = Object.entries(playerRatingsById)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const martingaleTop3 = nowTop3Ids.map(pid => {
      const state = martingaleState.get(pid) || { stake: MANTINGALE_START_STAKE, lastOutcome: null };
      return {
        id: pid,
        name: playerNamesById[pid] || pid,
        stake: state.stake,
        lastOutcome: state.lastOutcome,
        odds: MANTINGALE_ODDS
      };
    });

    const martingaleSummary = {
      totalStaked: Number(totalStaked.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      profit: Number((totalReturn - totalStaked).toFixed(2)),
      odds: MANTINGALE_ODDS
    };

    res.json({
      matches,
      teamRatings,
      playerRatings: playerRatingsByName,
      martingale: {
        top3: martingaleTop3,
        summary: martingaleSummary
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Chyba pri načítaní zápasov" });
  }
});

// detail zápasu
app.get("/match-details/:homeId/:awayId", async (req, res) => {
  try {
    const { homeId, awayId } = req.params;
    const url = `https://api.sportradar.com/icehockey/trial/v2/en/competitors/${homeId}/versus/${awayId}/summaries.json?api_key=${API_KEY}`;
    const response = await axios.get(url);

    const lastMeeting = response.data.last_meetings?.[0];
    if (!lastMeeting) {
      return res.status(404).json({ error: "Žiadny zápas nenájdený" });
    }

    res.json(lastMeeting);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Chyba pri načítaní detailov zápasu" });
  }
});

// štatistiky tímu
app.get("/team/:competitorId", async (req, res) => {
  try {
    const { competitorId } = req.params;
    const url = `https://api.sportradar.com/icehockey/trial/v2/en/competitors/${competitorId}/summaries.json?api_key=${API_KEY}`;
    const response = await axios.get(url);

    const summaries = response.data.summaries || [];
    let wins = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

    summaries.forEach(m => {
      const home = m.sport_event.competitors[0];
      const away = m.sport_event.competitors[1];
      const hs = m.sport_event_status.home_score ?? 0;
      const as = m.sport_event_status.away_score ?? 0;

      if (home.id === competitorId) {
        goalsFor += hs;
        goalsAgainst += as;
        if (hs > as) wins++; else if (hs < as) losses++;
      }
      if (away.id === competitorId) {
        goalsFor += as;
        goalsAgainst += hs;
        if (as > hs) wins++; else if (as < hs) losses++;
      }
    });

    res.json({
      teamId: competitorId,
      totalGames: summaries.length,
      wins,
      losses,
      goalsFor,
      goalsAgainst
    });
  } catch (err) {
    console.error("Chyba /team/:id", err.message);
    res.status(500).json({ error: "Chyba pri načítaní štatistík tímu" });
  }
});

// ====================== SERVER START ======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server beží na http://localhost:${PORT}`);
});
