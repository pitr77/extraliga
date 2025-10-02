// /api/matches.js
import axios from "axios";

// --- Konfigurácia (môžeš si nastaviť SR_API_KEY vo Vercel > Project Settings > Environment Variables)
const API_KEY = process.env.SR_API_KEY || "WaNt9YL5305o4hT2iGrsnoxUhegUG0St1ZYcs11g";
const SEASON_ID = "sr:season:131005"; // Extraliga 25/26

// rating – tímy
const START_RATING = 1500;
const GOAL_POINTS = 10;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;

// rating – hráči
const PLAYER_GOAL_POINTS = 20;
const PLAYER_ASSIST_POINTS = 10;

function sortByStartTimeAsc(matches) {
  return [...matches].sort((a, b) => {
    const ta = new Date(a?.sport_event?.start_time || 0).getTime() || 0;
    const tb = new Date(b?.sport_event?.start_time || 0).getTime() || 0;
    return ta - tb;
  });
}

export default async function handler(req, res) {
  try {
    const url = `https://api.sportradar.com/icehockey/trial/v2/en/seasons/${SEASON_ID}/summaries.json?api_key=${API_KEY}`;
    const response = await axios.get(url);
    const matches = response.data?.summaries || [];

    const ordered = sortByStartTimeAsc(matches);

    const teamRatings = {};
    const playerRatingsById = {};
    const playerNamesById = {};

    for (const match of ordered) {
      const status = match?.sport_event_status?.status;
      if (status !== "closed" && status !== "ap") continue;

      // --- tímové ratingy
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

      // --- hráčske ratingy
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

    // Pre frontend: hráčske ratingy podľa mena
    const playerRatings = {};
    Object.entries(playerRatingsById).forEach(([pid, rating]) => {
      const name = playerNamesById[pid] || pid;
      playerRatings[name] = rating;
    });

    res.status(200).json({
      matches,
      teamRatings,
      playerRatings,
    });
  } catch (err) {
    console.error("ERR /api/matches:", err?.response?.status, err?.response?.data || err.message);
    res.status(500).json({ error: "Chyba pri načítaní zápasov" });
  }
}
