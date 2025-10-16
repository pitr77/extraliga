import axios from "axios";

// NHL API – bez potreby API key
const BASE_URL = "https://api-web.nhle.com/v1";

const START_RATING = 1500;
const GOAL_POINTS = 10;
const WIN_POINTS = 10;
const LOSS_POINTS = -10;
const PLAYER_GOAL_POINTS = 20;
const PLAYER_ASSIST_POINTS = 10;
const MANTINGALE_ODDS = 2.5;
const MANTINGALE_START_STAKE = 1;

// Pomocná funkcia na generovanie dátumov od začiatku sezóny po dnes
function getDateRange(start, end) {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default async function handler(req, res) {
  try {
    const startDate = new Date("2025-10-08");
    const endDate = new Date();
    const dateList = getDateRange(startDate, endDate);

    let allGames = [];

    // 1️⃣ načítame všetky zápasy od začiatku sezóny
    for (const date of dateList) {
      try {
        const url = `${BASE_URL}/schedule/${date}`;
        const resp = await axios.get(url);
        const games = resp.data?.gameWeek?.[0]?.games || [];
        const played = games.filter((g) => g.gameState === "FINAL");
        allGames.push(...played);
      } catch (err) {
        // ak pre daný deň nie sú zápasy, pokračujeme
        continue;
      }
    }

    // 2️⃣ pre každý zápas načítame boxscore
    const matchesWithStats = await Promise.all(
      allGames.map(async (game) => {
        try {
          const gameId = game.id;
          const detailUrl = `${BASE_URL}/gamecenter/${gameId}/boxscore`;
          const det = await axios.get(detailUrl);
          return {
            ...game,
            boxscore: det.data,
          };
        } catch {
          return game;
        }
      })
    );

    // 3️⃣ výpočty ratingov
    const teamRatings = {};
    const playerRatingsById = {};
    const playerNamesById = {};
    const martingaleState = new Map();
    let totalStaked = 0;
    let totalReturn = 0;

    for (const game of matchesWithStats) {
      const homeTeam = game.homeTeam;
      const awayTeam = game.awayTeam;
      const homeName = homeTeam.placeName.default + " " + homeTeam.commonName.default;
      const awayName = awayTeam.placeName.default + " " + awayTeam.commonName.default;
      const homeScore = game.homeTeam.score ?? 0;
      const awayScore = game.awayTeam.score ?? 0;

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

      // 🔹 hráči – boxscore
      const playersHome = game.boxscore?.playerByGameStats?.homeTeam?.skaters || [];
      const playersAway = game.boxscore?.playerByGameStats?.awayTeam?.skaters || [];
      const allPlayers = [...playersHome, ...playersAway];

      for (const p of allPlayers) {
        const pid = p.playerId;
        const name = p.playerName?.default;
        const g = p.goals ?? 0;
        const a = p.assists ?? 0;

        if (!pid) continue;
        playerNamesById[pid] = name;
        if (playerRatingsById[pid] == null) playerRatingsById[pid] = START_RATING;
        playerRatingsById[pid] += g * PLAYER_GOAL_POINTS + a * PLAYER_ASSIST_POINTS;
      }

      // 🔹 Mantingal simulácia (TOP 3)
      const currentTop3 = Object.entries(playerRatingsById)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      const playersInMatch = new Set(allPlayers.map((p) => p.playerId));
      const goalsById = new Map(allPlayers.map((p) => [p.playerId, p.goals ?? 0]));

      for (const pid of currentTop3) {
        if (!playersInMatch.has(pid)) continue;
        if (!martingaleState.has(pid))
          martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: null });

        const state = martingaleState.get(pid);
        totalStaked += state.stake;

        const scored = (goalsById.get(pid) ?? 0) > 0;
        if (scored) {
          totalReturn += state.stake * MANTINGALE_ODDS;
          martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: "win" });
        } else {
          martingaleState.set(pid, { stake: state.stake * 2, lastOutcome: "loss" });
        }
      }
    }

    // 4️⃣ Výsledné hodnoty
    const playerRatingsByName = {};
    for (const [pid, rating] of Object.entries(playerRatingsById)) {
      const name = playerNamesById[pid] || pid;
      playerRatingsByName[name] = rating;
    }

    const nowTop3Ids = Object.entries(playerRatingsById)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const martingaleTop3 = nowTop3Ids.map((pid) => {
      const state =
        martingaleState.get(pid) || { stake: MANTINGALE_START_STAKE, lastOutcome: null };
      return {
        id: pid,
        name: playerNamesById[pid] || pid,
        stake: state.stake,
        lastOutcome: state.lastOutcome,
        odds: MANTINGALE_ODDS,
      };
    });

    const martingaleSummary = {
      totalStaked: Number(totalStaked.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      profit: Number((totalReturn - totalStaked).toFixed(2)),
      odds: MANTINGALE_ODDS,
    };

    res.status(200).json({
      matches: matchesWithStats,
      teamRatings,
      playerRatings: playerRatingsByName,
      martingale: { top3: martingaleTop3, summary: martingaleSummary },
    });
  } catch (err) {
    console.error("❌ Chyba:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní zápasov NHL" });
  }
}
