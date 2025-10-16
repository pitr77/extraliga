// api/matches.js
import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";
const START_DATE = "2025-10-08"; // začiatok aktuálnej sezóny

// jednoduché váhy na rating
const START_RATING = 1500;
const GOAL_POINTS = 20;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;

export default async function handler(req, res) {
  try {
    let currentDate = START_DATE;
    const allGames = [];

    // ťaháme po týždňoch (NHL API vráti aj nextStartDate)
    for (let i = 0; i < 8; i++) { // max 8 týždňov, aby sme nešli donekonečna
      const url = `${BASE_URL}/schedule/${currentDate}`;
      console.log("🔹 Načítavam:", url);
      const resp = await axios.get(url);
      const data = resp.data;

      if (data?.gameWeek) {
        data.gameWeek.forEach(week => {
          if (Array.isArray(week.games)) {
            allGames.push(...week.games);
          }
        });
      }

      if (!data.nextStartDate || data.nextStartDate === currentDate) break;
      currentDate = data.nextStartDate;
    }

    if (allGames.length === 0) {
      return res.status(200).json({ matches: [], teamRatings: {}, playerRatings: {}, martingale: {} });
    }

    // filtrovanie ukončených zápasov
    const completed = allGames.filter(g => g.gameState === "OFF" || g.gameState === "FINAL");

    // rating tímov
    const teamRatings = {};
    completed.forEach(g => {
      const home = g.homeTeam?.abbrev;
      const away = g.awayTeam?.abbrev;
      const hs = g.homeTeam?.score ?? 0;
      const as_ = g.awayTeam?.score ?? 0;

      if (!teamRatings[home]) teamRatings[home] = START_RATING;
      if (!teamRatings[away]) teamRatings[away] = START_RATING;

      teamRatings[home] += (hs - as_) * GOAL_POINTS;
      teamRatings[away] += (as_ - hs) * GOAL_POINTS;

      if (hs > as_) {
        teamRatings[home] += WIN_POINTS;
        teamRatings[away] += LOSS_POINTS;
      } else if (as_ > hs) {
        teamRatings[away] += WIN_POINTS;
        teamRatings[home] += LOSS_POINTS;
      }
    });

    // zoradené zápasy podľa dátumu
    completed.sort((a, b) => new Date(b.startTimeUTC) - new Date(a.startTimeUTC));

    // výsledná odpoveď
    res.status(200).json({
      matches: completed,
      teamRatings,
      playerRatings: {},
      martingale: {}
    });
  } catch (err) {
    console.error("❌ Chyba v NHL matches handleri:", err.message);
    res.status(500).json({ error: err.message });
  }
}
