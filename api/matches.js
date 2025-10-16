// api/matches.js
import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";
const START_DATE = "2025-10-08"; // začiatok sezóny 24/25
const END_DATE = "2026-04-20"; // predpokladaný koniec základnej časti

export default async function handler(req, res) {
  try {
    const allGames = [];

    // iteruj cez dni od začiatku sezóny po koniec
    let currentDate = new Date(START_DATE);
    const endDate = new Date(END_DATE);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const url = `${BASE_URL}/schedule/${dateStr}`;

      try {
        const response = await axios.get(url);
        const weeks = response.data?.gameWeek || [];
        for (const week of weeks) {
          if (Array.isArray(week.games)) {
            week.games.forEach(g => {
              allGames.push({
                id: g.id,
                date: week.date,
                home_team: g.homeTeam?.abbrev,
                away_team: g.awayTeam?.abbrev,
                home_score: g.homeTeam?.score ?? 0,
                away_score: g.awayTeam?.score ?? 0,
                status: g.gameState,
                venue: g.venue?.default ?? "",
                gameLink: g.gameCenterLink ?? "",
              });
            });
          }
        }
      } catch {
        // dni bez zápasov ignorujeme
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (!allGames.length) {
      return res.status(200).json({
        matches: [],
        teamRatings: {},
        playerRatings: {},
        martingale: {},
      });
    }

    // --- Výpočet ratingov tímov (zjednodušená verzia) ---
    const teamRatings = {};
    for (const g of allGames) {
      if (!teamRatings[g.home_team]) teamRatings[g.home_team] = 1500;
      if (!teamRatings[g.away_team]) teamRatings[g.away_team] = 1500;
      teamRatings[g.home_team] += (g.home_score - g.away_score) * 5;
      teamRatings[g.away_team] += (g.away_score - g.home_score) * 5;
    }

    // zoradenie podľa dátumu (novšie hore)
    allGames.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      matches: allGames,
      teamRatings,
      playerRatings: {},
      martingale: {},
    });
  } catch (err) {
    console.error("❌ Chyba NHL API:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát" });
  }
}
