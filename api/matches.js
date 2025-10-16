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

/** Pomocná funkcia – zoradenie zápasov podľa času */
function sortByStartTimeAsc(matches) {
  return [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Extrahuje hráčov z boxscore endpointu */
function extractPlayersFromBoxscore(boxscore) {
  const players = [];

  const teams = [boxscore?.homeTeam, boxscore?.awayTeam];
  for (const team of teams) {
    if (!team?.players) continue;
    for (const [_, player] of Object.entries(team.players)) {
      const id = player.playerId || player.id || player.name;
      const name = player.firstName?.default + " " + player.lastName?.default;
      const stats = player?.skaterStats || player?.goalieStats || {};
      const goals = stats.goals || 0;
      const assists = stats.assists || 0;
      players.push({ id, name, goals, assists });
    }
  }

  return players;
}

export default async function handler(req, res) {
  try {
    // 1️⃣ Získaj aktuálny rozpis zápasov NHL
    const scheduleUrl = "https://api-web.nhle.com/v1/schedule/now";
    const scheduleRes = await axios.get(scheduleUrl);
    const games =
      scheduleRes.data?.gameWeek?.flatMap((day) => day.games) || [];

    // 2️⃣ Pre každý zápas získaj boxscore (hráči, góly, atď.)
    const matchesWithStats = await Promise.all(
      games.map(async (g) => {
        try {
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`;
          const boxRes = await axios.get(boxUrl);
          return { ...g, boxscore: boxRes.data };
        } catch {
          return { ...g, boxscore: null };
        }
      })
    );

    // --- Výpočty ratingov + Mantingal ---
    const ordered = sortByStartTimeAsc(matchesWithStats);

    const teamRatings = {};
    const playerRatingsById = {};
    const playerNamesById = {};
    const martingaleState = new Map();
    let totalStaked = 0;
    let totalReturn = 0;

    for (const match of ordered) {
      const players = extractPlayersFromBoxscore(match.boxscore);
      const home = match.homeTeam?.placeName?.default + " " + match.homeTeam?.commonName?.default;
      const away = match.awayTeam?.placeName?.default + " " + match.awayTeam?.commonName?.default;

      const homeScore = match.boxscore?.homeTeam?.score ?? 0;
      const awayScore = match.boxscore?.awayTeam?.score ?? 0;

      // --- RATING HRÁČOV ---
      for (const p of players) {
        const pid = p.id;
        if (!pid) continue;
        playerNamesById[pid] = p.name;
        if (playerRatingsById[pid] == null)
          playerRatingsById[pid] = START_RATING;
        playerRatingsById[pid] +=
          p.goals * PLAYER_GOAL_POINTS + p.assists * PLAYER_ASSIST_POINTS;
      }

      // --- RATING TÍMOV ---
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

      // --- MANTINGAL ---
      const currentTop3 = Object.entries(playerRatingsById)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      const playerIds = new Set(players.map((p) => p.id));

      currentTop3.forEach((pid) => {
        if (playerIds.has(pid)) {
          if (!martingaleState.has(pid)) {
            martingaleState.set(pid, {
              stake: MANTINGALE_START_STAKE,
              lastOutcome: null,
            });
          }
          totalStaked += martingaleState.get(pid).stake;
        }
      });

      currentTop3.forEach((pid) => {
        if (!playerIds.has(pid)) return;
        const state = martingaleState.get(pid);
        const player = players.find((p) => p.id === pid);
        const scored = player && player.goals > 0;

        if (scored) {
          totalReturn += state.stake * MANTINGALE_ODDS;
          martingaleState.set(pid, {
            stake: MANTINGALE_START_STAKE,
            lastOutcome: "win",
          });
        } else {
          martingaleState.set(pid, {
            stake: state.stake * 2,
            lastOutcome: "loss",
          });
        }
      });
    }

    // --- Konverzia hráčskych ID na mená ---
    const playerRatingsByName = {};
    for (const [pid, rating] of Object.entries(playerRatingsById)) {
      const name = playerNamesById[pid] || pid;
      playerRatingsByName[name] = rating;
    }

    const martingaleSummary = {
      totalStaked: Number(totalStaked.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      profit: Number((totalReturn - totalStaked).toFixed(2)),
      odds: MANTINGALE_ODDS,
    };

    // --- Odpoveď ---
    res.status(200).json({
      matches: matchesWithStats,
      teamRatings,
      playerRatings: playerRatingsByName,
      martingale: { summary: martingaleSummary },
    });
  } catch (err) {
    console.error("❌ Chyba pri načítaní NHL dát:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát" });
  }
}
