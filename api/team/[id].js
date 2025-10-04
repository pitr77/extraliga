// frontend/api/team/[id].js
import axios from "axios";

export default async function handler(req, res) {
  const { id } = req.query;

  const API_KEY = process.env.API_KEY || "WaNt9YL5305o4hT2iGrsnoxUhegUG0St1ZYcs11g";

  try {
    const url = `https://api.sportradar.com/icehockey/trial/v2/en/competitors/${id}/summaries.json?api_key=${API_KEY}`;
    const response = await axios.get(url);

    const summaries = response.data.summaries || [];
    let wins = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

    summaries.forEach(m => {
      const home = m.sport_event.competitors[0];
      const away = m.sport_event.competitors[1];
      const hs = m.sport_event_status.home_score ?? 0;
      const as = m.sport_event_status.away_score ?? 0;

      if (home.id === id) {
        goalsFor += hs;
        goalsAgainst += as;
        if (hs > as) wins++; else if (hs < as) losses++;
      }
      if (away.id === id) {
        goalsFor += as;
        goalsAgainst += hs;
        if (as > hs) wins++; else if (as < hs) losses++;
      }
    });

    res.status(200).json({
      teamId: id,
      totalGames: summaries.length,
      wins,
      losses,
      goalsFor,
      goalsAgainst
    });
  } catch (err) {
    console.error("Chyba pri /api/team/[id]:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní štatistík tímu" });
  }
}
