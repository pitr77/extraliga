// public/app.js

let teamRatings = {};
let playerRatings = {};
let allMatches = [];

const BASE_STAKE = 1;
const ODDS = 2.5;

// API cez Vercel serverless funkcie (/api)
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

  // Hráči
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

// ========================= API načítanie =========================
async function fetchMatches() {
  try {
    const response = await fetch(`${API_BASE}/api/matches`);
    const data = await response.json();
    console.log("✅ FETCH DATA:", data);

    let matches = [];
    const rawMatches = Array.isArray(data.matches) ? data.matches : [];
    const normalized = rawMatches.map(normalizeNhlGame);

    allMatches = normalized;
    matches = normalized.map(m => ({
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

    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    displayMatches(matches);
    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};
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

      row.style.cursor = "pointer";
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
  sortedPlayers.forEach(([player, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${player}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

// ========================= Mantingal =========================
function displayMantingal() {
  const pcWrapper = document.querySelector("#players-section");
  const mobileWrapper = document.getElementById("mantingal-container");
  if (pcWrapper) pcWrapper.innerHTML = "";
  if (mobileWrapper) mobileWrapper.innerHTML = "";

  const container = document.createElement("div");
  container.innerHTML = `
    <table id="mantingal">
      <thead>
        <tr><th colspan="5">Mantingal – TOP 3 (kurz ${ODDS})</th></tr>
        <tr><th>Hráč</th><th>Kurz</th><th>Vklad</th><th>Posledný výsledok</th><th>Denník</th></tr>
      </thead>
      <tbody>
        <tr><td colspan="5">Simulácia sa načíta po dátach...</td></tr>
      </tbody>
    </table>
  `;
  if (isMobile()) mobileWrapper?.appendChild(container);
  else pcWrapper?.appendChild(container);
}

// ========================= START =========================
window.addEventListener("DOMContentLoaded", () => {
  setupMobileSectionsOnLoad();
  fetchMatches();
});
