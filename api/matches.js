// api/matches.js
import axios from "axios";

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

export default async function handler(req, res) {
  try {
    // 1️⃣ načítaj všetky dátumy zo zápasového kalendára
    const calendarUrl = "https://api-web.nhle.com/v1/schedule-calendar/now";
    const calRes = await axios.get(calendarUrl);
    const dates = (calRes.data?.gameWeek || [])
      .flatMap(week => week.games.map(g => g.startTimeUTC.slice(0, 10)))
      .filter((v, i, a) => a.indexOf(v) === i);

    if (!dates.length) {
      return res.json({ matches: [], teamRatings: {}, playerRatings: {}, martingale: {} });
    }

    // 2️⃣ pre každý dátum zober zápasy
    const allGames = [];
    for (const date of dates) {
      const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;
      const scoreRes = await axios.get(scoreUrl);
      if (Array.isArray(scoreRes.data.games)) {
        allGames.push(...scoreRes.data.games);
      }
    }

    // 3️⃣ vyber len ukončené zápasy
    const completed = allGames.filter(g => g.gameState === "OFF" || g.gameState === "FINAL");
    if (completed.length === 0) {
      return res.json({ matches: [], teamRatings: {}, playerRatings: {}, martingale: {} });
    }

    // 4️⃣ Výpočet ratingov a mantingalu
    const teamRatings = {};
    const playerRatingsById = {};
    const playerNamesById = {};
    const martingaleState = new Map();
    let totalStaked = 0;
    let totalReturn = 0;

    for (const game of completed) {
      const home = game.homeTeam?.abbrev || "HOME";
      const away = game.awayTeam?.abbrev || "AWAY";
      const homeScore = game.homeTeam?.score ?? 0;
      const awayScore = game.awayTeam?.score ?? 0;

      if (!teamRatings[home]) teamRatings[home] = START_RATING;
      if (!teamRatings[away]) teamRatings[away] = START_RATING;

      teamRatings[home] += homeScore * GOAL_POINTS - awayScore * GOAL_POINTS;
      teamRatings[away] += awayScore * GOAL_POINTS - homeScore * GOAL_POINTS;

      if (homeScore > awayScore) {
        teamRatings[home] += WIN_POINTS;
        teamRatings[away] += LOSS_POINTS;
      } else if (awayScore > homeScore) {
        teamRatings[away] += WIN_POINTS;
        teamRatings[home] += LOSS_POINTS;
      }

      // 🟢 načítaj podrobnosti (boxscore) pre rating hráčov
      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
        const boxRes = await axios.get(boxUrl);
        const players = [
          ...(boxRes.data.homeTeam?.players || []),
          ...(boxRes.data.awayTeam?.players || [])
        ];

        players.forEach(p => {
          const id = p.playerId;
          const name = p.firstName?.default + " " + p.lastName?.default;
          playerNamesById[id] = name;
          if (!playerRatingsById[id]) playerRatingsById[id] = START_RATING;
          const goals = p?.stat?.goals || 0;
          const assists = p?.stat?.assists || 0;
          playerRatingsById[id] += goals * PLAYER_GOAL_POINTS + assists * PLAYER_ASSIST_POINTS;
        });

        // Mantingal simulácia
        const currentTop3 = Object.entries(playerRatingsById)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => id);

        currentTop3.forEach(pid => {
          if (!martingaleState.has(pid)) {
            martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: null });
          }
          const state = martingaleState.get(pid);
          totalStaked += state.stake;
        });

        const scorers = players.filter(p => (p?.stat?.goals || 0) > 0).map(p => p.playerId);

        currentTop3.forEach(pid => {
          const state = martingaleState.get(pid);
          if (scorers.includes(pid)) {
            totalReturn += state.stake * MANTINGALE_ODDS;
            martingaleState.set(pid, { stake: MANTINGALE_START_STAKE, lastOutcome: "win" });
          } else {
            martingaleState.set(pid, { stake: state.stake * 2, lastOutcome: "loss" });
          }
        });
      } catch (e) {
        console.warn("⚠️ Nepodarilo sa načítať boxscore pre", game.id);
      }
    }

    const playerRatingsByName = {};
    Object.entries(playerRatingsById).forEach(([pid, rating]) => {
      const name = playerNamesById[pid] || pid;
      playerRatingsByName[name] = rating;
    });

    const martingaleSummary = {
      totalStaked: Number(totalStaked.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      profit: Number((totalReturn - totalStaked).toFixed(2)),
      odds: MANTINGALE_ODDS
    };

    res.status(200).json({
      matches: completed,
      teamRatings,
      playerRatings: playerRatingsByName,
      martingale: { summary: martingaleSummary }
    });
  } catch (err) {
    console.error("❌ Chyba pri načítaní NHL dát:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát" });
  }
}
