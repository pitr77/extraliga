// api/matches.js
import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";
const START_DATE = "2025-10-08"; // začiatok sezóny

export default async function handler(req, res) {
  try {
    let currentDate = START_DATE;
    const allGames = [];

    // načítaj 5 týždňov (stačí pre test)
    for (let i = 0; i < 5; i++) {
      const url = `${BASE_URL}/schedule/${currentDate}`;
      const resp = await axios.get(url);
      const data = resp.data;
      if (data?.gameWeek) {
        data.gameWeek.forEach((week) => {
          if (Array.isArray(week.games)) {
            allGames.push(...week.games);
          }
        });
      }
      if (!data.nextStartDate || data.nextStartDate === currentDate) break;
      currentDate = data.nextStartDate;
    }

    // filtrovanie odohratých zápasov
    const completed = allGames.filter(
      (g) => g.gameState === "OFF" || g.gameState === "FINAL"
    );

    // premapovanie pre frontend
    const normalized = completed.map((g) => ({
      sport_event: {
        id: g.id,
        start_time: g.startTimeUTC,
        competitors: [
          { name: `${g.homeTeam.placeName.default} ${g.homeTeam.commonName.default}` },
          { name: `${g.awayTeam.placeName.default} ${g.awayTeam.commonName.default}` },
        ],
      },
      sport_event_status: {
        status: "closed",
        home_score: g.homeTeam.score,
        away_score: g.awayTeam.score,
      },
    }));

    // výpočet ratingov tímov (len orientačný)
    const teamRatings = {};
    normalized.forEach((m) => {
      const home = m.sport_event.competitors[0].name;
      const away = m.sport_event.competitors[1].name;
      const hs = m.sport_event_status.home_score;
      const as_ = m.sport_event_status.away_score;

      if (!teamRatings[home]) teamRatings[home] = 1500;
      if (!teamRatings[away]) teamRatings[away] = 1500;

      teamRatings[home] += (hs - as_) * 10;
      teamRatings[away] += (as_ - hs) * 10;
    });

    // odpoveď pre frontend
    res.status(200).json({
      matches: normalized,
      teamRatings,
      playerRatings: {},
      martingale: {},
    });
  } catch (err) {
    console.error("❌ Chyba pri načítaní NHL dát:", err.message);
    res.status(500).json({ error: err.message });
  }
}
