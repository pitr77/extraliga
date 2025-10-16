// public/app.js

let teamRatings = {};
let playerRatings = {};
let allMatches = [];

const BASE_STAKE = 1;
const ODDS = 2.5;

// API cez Vercel serverless funkcie (/api)
// (Nepoužijeme – ideme priamo na NHL API, aby si hneď videl zápasy.)
const API_BASE = "";

// --- Pomocné: detekcia mobilu / desktopu ---
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

// --- Pomocné: sanitizácia textu do id ---
const slug = (s) => encodeURIComponent(String(s || "").toLowerCase().replace(/\s+/g, "-"));

// --- Mapovanie tímov na ich Sportradar ID (ponechané pre štruktúru) ---
const TEAM_IDS = {
  "HKM Zvolen": "sr:competitor:3924",
  "Spisska Nova Ves": "sr:competitor:3925",
  "Mhk 32 Liptovsky Mikulas": "sr:competitor:3926",
  "Slovan Bratislava": "sr:competitor:3927",
  "HK Vlci Zilina": "sr:competitor:3929",
  "HC Kosice": "sr:competitor:3930",
  "HK Poprad": "sr:competitor:3931",
  "HK Dukla Trencin": "sr:competitor:3933",
  "HK Nitra": "sr:competitor:5607",
  "HC 05 Banska Bystrica": "sr:competitor:25008",
  "Dukla Michalovce": "sr:competitor:122968",
  "HC Presov": "sr:competitor:122972"
};

// === NOVÉ: mapovanie NHL -> extraliga štruktúra ===
function nhlTeamName(t) {
  if (!t) return "Neznámy tím";
  const place = t.placeName?.default || "";
  const common = t.commonName?.default || "";
  const combo = `${place} ${common}`.trim();
  return combo || t.triCode || t.abbrev || "Tím";
}

function mapNhlPlayersToExtraligaPlayers(nhlSkaters = []) {
  return nhlSkaters.map((p) => ({
    id: p.playerId || p.id || p.slug || p.jerseyNumber || Math.random().toString(36).slice(2),
    name:
      p.playerName?.default ||
      `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim() ||
      "Hráč",
    statistics: {
      goals: p.goals ?? 0,
      assists: p.assists ?? 0
    }
  }));
}

function normalizeNhlGame(game) {
  // Oprava stavov z NHL API
  let status = "not_started";
  const st = String(game.gameState || "").toUpperCase();
  if (["FINAL", "OFF", "COMPLETE", "POST"].includes(st)) status = "closed";
  else if (["LIVE", "IN_PROGRESS"].includes(st)) status = "ap";

  // Skóre
  const homeScore = game.homeTeam?.score ?? game.boxscore?.homeTeam?.score ?? 0;
  const awayScore = game.awayTeam?.score ?? game.boxscore?.awayTeam?.score ?? 0;

  // Časy
  const startISO = game.startTimeUTC || game.startTime || game.commence_time || new Date().toISOString();

  // Hráči (neťaháme boxscore, aby to bolo rýchle; placeholdery ostávajú)
  const homeSkaters = game.boxscore?.playerByGameStats?.homeTeam?.skaters || [];
  const awaySkaters = game.boxscore?.playerByGameStats?.awayTeam?.skaters || [];

  // Tretiny (ak sú)
  const periodScores =
    game.boxscore?.linescore?.periods?.map((p) => ({
      home_score: p.home,
      away_score: p.away
    })) || [];

  return {
    id: game.id,
    sport_event: {
      id: String(game.id || ""),
      start_time: startISO,
      competitors: [
        { id: String(game.homeTeam?.id || game.homeTeam?.abbrev || "HOME"), name: nhlTeamName(game.homeTeam) },
        { id: String(game.awayTeam?.id || game.awayTeam?.abbrev || "AWAY"), name: nhlTeamName(game.awayTeam) }
      ]
    },
    sport_event_status: {
      status,
      home_score: homeScore,
      away_score: awayScore,
      overtime: false,
      ap: status === "ap",
      period_scores: periodScores
    },
    statistics: {
      totals: {
        competitors: [
          {
            qualifier: "home",
            name: nhlTeamName(game.homeTeam),
            players: mapNhlPlayersToExtraligaPlayers(homeSkaters)
          },
          {
            qualifier: "away",
            name: nhlTeamName(game.awayTeam),
            players: mapNhlPlayersToExtraligaPlayers(awaySkaters)
          }
        ]
      }
    }
  };
}

// --- Mobilné sekcie ---
function setupMobileSectionsOnLoad() {
  const select = document.getElementById("mobileSelect");
  const sections = document.querySelectorAll(".section");
  if (!select) return;

  if (isMobile()) {
    select.value = "matches";
    sections.forEach(sec => sec.style.display = "none");
    const matches = document.getElementById("matches-section");
    if (matches) matches.style.display = "block";
  } else {
    sections.forEach(sec => (sec.style.display = ""));
  }

  select.addEventListener("change", () => {
    if (isMobile()) {
      if (select.value === "mantingal") displayMantingal();
    }
  });

  window.addEventListener("resize", () => {
    if (isMobile()) {
      sections.forEach(sec => sec.style.display = "none");
      const current = document.getElementById(`${select.value}-section`) || document.getElementById("mantingal-container");
      if (select.value === "mantingal") {
        const m = document.getElementById("mantingal-container");
        if (m) m.style.display = "block";
      } else if (current) current.style.display = "block";
    } else {
      sections.forEach(sec => (sec.style.display = ""));
    }
    displayMantingal();
  });
}

// ========================= Pomocné: dátumy =========================
const START_DATE = "2025-10-08"; // prvý deň sezóny, ktorý chceš
function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function* dateRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    yield formatDate(d);
  }
}

// ========================= API načítanie – NHL priamo =========================
async function fetchScheduleByDate(dateStr) {
  const url = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
  const resp = await fetch(url, { headers: { "accept": "application/json" } });
  if (!resp.ok) throw new Error(`NHL schedule ${dateStr} HTTP ${resp.status}`);
  return resp.json();
}

async function fetchAllSince(startDate) {
  const today = new Date();
  const todayStr = formatDate(today);

  const outGames = [];
  for (const day of dateRange(startDate, todayStr)) {
    try {
      const data = await fetchScheduleByDate(day);
      const groups = Array.isArray(data.gameWeek) ? data.gameWeek : [];
      groups.forEach(g => {
        const games = Array.isArray(g.games) ? g.games : [];
        games.forEach(game => {
          // berieme len ukončené alebo live – aby si niečo videl
          const st = String(game.gameState || "").toUpperCase();
          if (["FINAL", "OFF", "COMPLETE", "POST", "LIVE", "IN_PROGRESS"].includes(st)) {
            // pridaj aj "date" pole, nech vieme radiť a zoskupovať
            outGames.push({ ...game, _day: g.date || day });
          }
        });
      });
    } catch (e) {
      console.warn(`Deň ${day}: nepodarilo sa načítať (${e.message})`);
    }
  }
  return outGames;
}

function computeTeamRatingsFromMatches(normalizedMatches) {
  const START_RATING = 1500;
  const GOAL_POINTS = 10;
  const WIN_POINTS = 10;
  const LOSS_POINTS = -10;

  const ratings = {};
  const ensure = (team) => {
    if (ratings[team] == null) ratings[team] = START_RATING;
  };

  // prechádzame len ukončené zápasy
  const done = normalizedMatches.filter(m => {
    const st = String(m.sport_event_status?.status || "").toLowerCase();
    return st === "closed" || st === "ap";
  });

  done.forEach(m => {
    const home = m.sport_event.competitors[0].name;
    const away = m.sport_event.competitors[1].name;
    const hs = m.sport_event_status.home_score ?? 0;
    const as = m.sport_event_status.away_score ?? 0;

    ensure(home); ensure(away);

    ratings[home] += hs * GOAL_POINTS - as * GOAL_POINTS;
    ratings[away] += as * GOAL_POINTS - hs * GOAL_POINTS;

    if (hs > as) {
      ratings[home] += WIN_POINTS;
      ratings[away] += LOSS_POINTS;
    } else if (as > hs) {
      ratings[away] += WIN_POINTS;
      ratings[home] += LOSS_POINTS;
    }
  });

  return ratings;
}

// ========================= fetchMatches =========================
async function fetchMatches() {
  try {
    // 1) Stiahnuť všetky dni od START_DATE do dnes
    const games = await fetchAllSince(START_DATE);

    // 2) Normalizácia na tvoj „extraliga“ formát
    const normalized = games.map(normalizeNhlGame);

    // 3) Uložiť pre Mantingal a tabuľku
    allMatches = normalized;

    // 4) Zoznam pre tabuľku (len to, čo potrebuje render)
    let matches = normalized.map(m => ({
      id: m.id || m.sport_event?.id,
      home_id: m.sport_event.competitors[0].id,
      away_id: m.sport_event.competitors[1].id,
      home_team: m.sport_event.competitors[0].name,
      away_team: m.sport_event.competitors[1].name,
      home_score: m.sport_event_status.home_score,
      away_score: m.sport_event_status.away_score,
      status: m.sport_event_status.status,
      overtime: m.sport_event_status.overtime,
      ap: m.sport_event_status.ap,
      date: new Date(m.sport_event.start_time).toISOString().slice(0, 10)
    }));

    // 5) Zoradiť od najnovšieho
    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 6) Team ratingy z výsledkov
    teamRatings = computeTeamRatingsFromMatches(normalized);

    // 7) (Voliteľné) Player ratings & mantingal – momentálne prázdne, kým nedotiahneme boxscore
    playerRatings = {}; // doplníme keď pripojíme boxscore

    // 8) Render
    displayMatches(matches);
    displayTeamRatings();
    displayPlayerRatings();
    displayMantingal();
  } catch (err) {
    console.error("Chyba pri načítaní zápasov:", err);
  }
}

// ========================= Zápasy =========================
function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const completed = matches.filter(m => {
    const st = String(m.status || "").toUpperCase();
    return ["CLOSED", "FINAL", "OFF", "AP", "LIVE"].includes(st);
  });

  if (completed.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  completed.sort((a, b) => new Date(b.date) - new Date(a.date));

  // zoskupiť podľa dňa
  const grouped = {};
  completed.forEach(m => {
    const day = new Date(m.date).toISOString().slice(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(m);
  });

  const allDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  allDays.forEach((day, index) => {
    const roundNumber = allDays.length - index;
    const roundRow = document.createElement("tr");
    roundRow.innerHTML = `<td colspan="4"><b>${roundNumber}. kolo (${day})</b></td>`;
    tableBody.appendChild(roundRow);

    grouped[day].forEach(match => {
      const homeScore = match.home_score ?? "-";
      const awayScore = match.away_score ?? "-";

      const row = document.createElement("tr");
      const st = String(match.status || "").toLowerCase();
      let statusText = "";
      if (["closed", "final", "off"].includes(st)) statusText = "✅";
      else if (["ap", "live"].includes(st)) statusText = "🟡 Live";

      row.innerHTML = `
        <td>${match.home_team}</td>
        <td>${match.away_team}</td>
        <td>${homeScore} : ${awayScore}</td>
        <td>${statusText}</td>
      `;

      tableBody.appendChild(row);
    });
  });
}

// ========================= Rating tímov =========================
function displayTeamRatings() {
  const tableBody = document.querySelector("#teamRatings tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const sortedTeams = Object.entries(teamRatings).sort((a, b) => b[1] - a[1]);
  sortedTeams.forEach(([team, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${team}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

// ========================= Rating hráčov =========================
function displayPlayerRatings() {
  const tableBody = document.querySelector("#playerRatings tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const sortedPlayers = Object.entries(playerRatings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (sortedPlayers.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="2">Bez dát (boxscore sa ešte nepripája)</td>`;
    tableBody.appendChild(row);
    return;
  }

  sortedPlayers.forEach(([player, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${player}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

/** ============================================================
 *  MANTINGAL – nechávam render a štruktúru, ale bez boxscore je zatiaľ prázdny.
 *  Keď dopojíme boxscore (players/goals), tento blok začne plniť denník.
 *  ============================================================ */
function displayMantingal() {
  const pcWrapper = document.querySelector("#players-section");
  const mobileWrapper = document.getElementById("mantingal-container");

  if (pcWrapper) {
    const oldPc = pcWrapper.querySelector("#mantingal-wrapper-pc");
    if (oldPc) oldPc.remove();
  }
  if (mobileWrapper) {
    mobileWrapper.innerHTML = "";
  }

  const buildMantingalNode = (context) => {
    const container = document.createElement("div");
    container.id = context === "pc" ? "mantingal-wrapper-pc" : "mantingal-wrapper-mobile";

    const table = document.createElement("table");
    table.id = "mantingal";
    table.innerHTML = `
      <thead>
        <tr><th colspan="5">Mantingal – TOP 3 (kurz ${ODDS})</th></tr>
        <tr><th>Hráč</th><th>Kurz</th><th>Vklad</th><th>Posledný výsledok</th><th>Denník</th></tr>
      </thead>
      <tbody>
        <tr><td colspan="5">Mantingal čaká na boxscore (hráčske góly). Zápasy už bežia OK.</td></tr>
      </tbody>
    `;

    const summary = document.createElement("div");
    summary.id = context === "pc" ? "mantingal-summary-pc" : "mantingal-summary-mobile";
    summary.innerHTML = `
      <p><b>Celkové stávky</b>: 0.00 €</p>
      <p><b>Výhry</b>: 0.00 €</p>
      <p><b>Profit</b>: 0.00 €</p>
    `;

    container.appendChild(table);
    container.appendChild(summary);
    return container;
  };

  if (isMobile()) {
    mobileWrapper?.appendChild(buildMantingalNode("mobile"));
  } else {
    const pcNode = buildMantingalNode("pc");
    document.querySelector("#players-section")?.appendChild(pcNode);
  }
}

// ========================= START =========================
window.addEventListener("DOMContentLoaded", () => {
  setupMobileSectionsOnLoad();
  fetchMatches();
});
