// api/matches.js
import axios from "axios";

const BASE = "https://api-web.nhle.com/v1";
const START_RATING = 1500;
const GOAL_POINTS = 10;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;

export default async function handler(req, res) {
  try {
    // 1️⃣ načítaj kalendár – týždne / dni s udalosťami
    const calRes = await axios.get(`${BASE}/schedule-calendar/now`);
    const weeks = calRes.data?.gameWeek || [];

    const datesWithGames = [];
    for (const w of weeks) {
      if (Array.isArray(w.games)) {
        // všetky dni s games v tomto týždni
        datesWithGames.push(w.date);
        // niektoré tímy môžu mať viac dní v týždni
      }
    }

    // ak žiadne dni
    if (datesWithGames.length === 0) {
      return res.status(200).json({ matches: [], teamRatings: {}, playerRatings: {}, martingale: {} });
    }

    const allGames = [];

    // 2️⃣ pre každý dátum s hrou načítaj schedule/{date}
    for (const d of datesWithGames) {
      try {
        const resp = await axios.get(`${BASE}/schedule/${d}`);
        const gWeeks = resp.data?.gameWeek || [];
        for (const gw of gWeeks) {
          if (Array.isArray(gw.games)) {
            allGames.push(...gw.games);
          }
        }
      } catch (e) {
        console.warn("Nepodarilo sa načítať schedule pre", d);
      }
    }

    // 3️⃣ filter – zápasy, ktoré už boli (state FINAL alebo OFF)
    const completed = allGames.filter(g => g.gameState === "FINAL" || g.gameState === "OFF");

    // 4️⃣ ak nič, vráti prázdny
    if (completed.length === 0) {
      return res.status(200).json({ matches: [], teamRatings: {}, playerRatings: {}, martingale: {} });
    }

    // 5️⃣ rating tímov (zjednodušene)
    const teamRatings = {};
    for (const g of completed) {
      const h = g.homeTeam?.abbrev;
      const a = g.awayTeam?.abbrev;
      const hs = g.homeTeam?.score ?? 0;
      const as_ = g.awayTeam?.score ?? 0;
      if (!teamRatings[h]) teamRatings[h] = START_RATING;
      if (!teamRatings[a]) teamRatings[a] = START_RATING;
      teamRatings[h] += (hs - as_) * GOAL_POINTS;
      teamRatings[a] += (as_ - hs) * GOAL_POINTS;
      if (hs > as_) {
        teamRatings[h] += WIN_POINTS;
        teamRatings[a] += LOSS_POINTS;
      } else if (as_ > hs) {
        teamRatings[a] += WIN_POINTS;
        teamRatings[h] += LOSS_POINTS;
      }
    }

    // zorad podľa dátumu klesajúco
    completed.sort((a, b) => new Date(b.startTimeUTC) - new Date(a.startTimeUTC));

    // 6️⃣ vráť JSON
    res.status(200).json({
      matches: completed,
      teamRatings,
      playerRatings: {},
      martingale: {}
    });
  } catch (err) {
    console.error("❌ Chyba v matches API:", err.message);
    res.status(500).json({ error: "Backend error" });
  }
}
