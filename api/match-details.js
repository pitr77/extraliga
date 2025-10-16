// api/match-details.js
import axios from "axios";

/**
 * Endpoint: /api/match-details?gameId=2025020061
 * Príklad: https://api-web.nhle.com/v1/gamecenter/2025020061/landing
 */

export default async function handler(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return res.status(400).json({ error: "Chýba parameter gameId" });
    }

    // 1️⃣ Načítaj základné údaje o zápase (skóre, tímy, status)
    const landingUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/landing`;
    const boxscoreUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;

    const [landingRes, boxRes] = await Promise.all([
      axios.get(landingUrl),
      axios.get(boxscoreUrl),
    ]);

    const landing = landingRes.data || {};
    const box = boxRes.data || {};

    const home = box.homeTeam;
    const away = box.awayTeam;

    const homeName =
      home?.placeName?.default + " " + home?.commonName?.default || "Domáci";
    const awayName =
      away?.placeName?.default + " " + away?.commonName?.default || "Hostia";

    const homeScore = home?.score ?? landing?.summary?.homeTeam?.score ?? 0;
    const awayScore = away?.score ?? landing?.summary?.awayTeam?.score ?? 0;

    // 2️⃣ Získaj štatistiky hráčov (góly a asistencie)
    function extractPlayers(team) {
      const players = [];
      if (!team?.players) return players;
      for (const [id, p] of Object.entries(team.players)) {
        const name = `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim();
        const stats = p.skaterStats || p.goalieStats || {};
        const goals = stats.goals || 0;
        const assists = stats.assists || 0;
        if (goals > 0 || assists > 0) {
          players.push({ name, goals, assists });
        }
      }
      return players;
    }

    const homePlayers = extractPlayers(home);
    const awayPlayers = extractPlayers(away);

    // 3️⃣ Získaj priebeh zápasu po tretinách (ak existuje)
    const periodScores = [];
    if (landing?.summary?.periodDescriptor) {
      const periods = landing.summary.periodDescriptor;
      periodScores.push({
        number: periods.number,
        type: periods.periodType,
      });
    } else if (box?.summary?.periodDescriptor) {
      const p = box.summary.periodDescriptor;
      periodScores.push({
        number: p.number,
        type: p.periodType,
      });
    }

    // 4️⃣ Výsledná odpoveď
    const result = {
      home_team: homeName,
      away_team: awayName,
      home_score: homeScore,
      away_score: awayScore,
      period_scores: periodScores,
      home_players: homePlayers,
      away_players: awayPlayers,
      raw: {
        landing,
        box,
      },
    };

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Chyba pri načítaní detailov NHL zápasu:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní detailov NHL zápasu" });
  }
}
