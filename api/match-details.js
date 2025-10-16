import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";

/**
 * Endpoint: /api/match-details?gameId=2025020061
 * Slúži na zobrazenie detailov (hráčov, góly, asistencie, tretiny, atď.)
 * Využíva NHL Web API endpoint:
 * https://api-web.nhle.com/v1/gamecenter/{game-id}/boxscore
 */
export default async function handler(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return res.status(400).json({ error: "Missing parameter: gameId" });
    }

    // načítanie boxscore pre daný zápas
    const url = `${BASE_URL}/gamecenter/${gameId}/boxscore`;
    const response = await axios.get(url);
    const boxscore = response.data;

    // --- štruktúra odpovede (aby pasovala na frontend) ---
    const homeTeam = boxscore?.homeTeam || {};
    const awayTeam = boxscore?.awayTeam || {};
    const homePlayers = boxscore?.playerByGameStats?.homeTeam?.skaters || [];
    const awayPlayers = boxscore?.playerByGameStats?.awayTeam?.skaters || [];

    const formatPlayer = (p) => ({
      id: p.playerId,
      name: p.playerName?.default,
      statistics: {
        goals: p.goals ?? 0,
        assists: p.assists ?? 0,
      },
    });

    const formatted = {
      sport_event_status: {
        home_score: homeTeam.score ?? 0,
        away_score: awayTeam.score ?? 0,
        period_scores:
          boxscore?.linescore?.periods?.map((p) => ({
            home_score: p.home,
            away_score: p.away,
          })) || [],
      },
      statistics: {
        totals: {
          competitors: [
            {
              qualifier: "home",
              name: `${homeTeam.placeName?.default} ${homeTeam.commonName?.default}`,
              players: homePlayers.map(formatPlayer),
            },
            {
              qualifier: "away",
              name: `${awayTeam.placeName?.default} ${awayTeam.commonName?.default}`,
              players: awayPlayers.map(formatPlayer),
            },
          ],
        },
      },
    };

    res.status(200).json(formatted);
  } catch (err) {
    console.error("❌ Chyba pri načítaní detailov zápasu:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní detailov zápasu NHL" });
  }
}
