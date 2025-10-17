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

// --- Mapovanie tímov na ich Sportradar ID ---
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

// === NOVÉ: mapovanie NHL -> pôvodný „extraliga“ tvar (aby zvyšok appky ostal) ===
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
    name: (p.playerName?.default || `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim() || "Hráč"),
    statistics: {
      goals: p.goals ?? 0,
      assists: p.assists ?? 0
    }
  }));
}

/**
 * Vstup: položka z /api/matches (NHL raw game + prípadne boxscore)
 * Výstup: objekt v pôvodnom „extraliga“ tvare (sport_event, sport_event_status, statistics...)
 */
function normalizeNhlGame(game) {
  let status = "not_started";
  if (game.gameState === "FINAL") status = "closed";
  else if (game.gameState === "LIVE") status = "ap";

  const homeScore = game.homeTeam?.score ?? game.boxscore?.homeTeam?.score ?? 0;
  const awayScore = game.awayTeam?.score ?? game.boxscore?.awayTeam?.score ?? 0;
  const startISO = game.startTimeUTC || game.startTime || game.commence_time || new Date().toISOString();

  const homeSkaters = game.boxscore?.playerByGameStats?.homeTeam?.skaters || [];
  const awaySkaters = game.boxscore?.playerByGameStats?.awayTeam?.skaters || [];

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

// --- NOVÉ: konverzia z „zjednodušeného“ backend zápasu -> minimálny extraliga tvar (bez štatistík)
function minimalExtraligaFromSimple(m) {
  return {
    id: m.id,
    sport_event: {
      id: String(m.id),
      start_time: m.start_time || new Date(m.date + "T00:00:00Z").toISOString(),
      competitors: [
        { id: m.home_team, name: m.home_team },
        { id: m.away_team, name: m.away_team }
      ]
    },
    sport_event_status: {
      status: m.status,
      home_score: m.home_score ?? 0,
      away_score: m.away_score ?? 0,
      overtime: false,
      ap: String(m.status || "").toLowerCase() === "ap",
      period_scores: []
    },
    statistics: null // nemáme boxscore
  };
}

// --- Initial mobile sekcie (aby po načítaní bolo niečo vidieť) ---
function setupMobileSectionsOnLoad() {
  const select = document.getElementById("mobileSelect");
  const sections = document.querySelectorAll(".section");

  if (!select) return;

  if (isMobile()) {
    // default – Zápasy
    select.value = "matches";
    sections.forEach(sec => sec.style.display = "none");
    const matches = document.getElementById("matches-section");
    if (matches) matches.style.display = "block";
  } else {
    sections.forEach(sec => (sec.style.display = ""));
  }

  select.addEventListener("change", () => {
    if (isMobile()) {
      if (select.value === "mantingal") {
        displayMantingal();
      }
    }
  });

  window.addEventListener("resize", () => {
    if (isMobile()) {
      sections.forEach(sec => sec.style.display = "none");
      const current = document.getElementById(`${select.value}-section`) || document.getElementById("mantingal-container");
      if (select.value === "mantingal") {
        const m = document.getElementById("mantingal-container");
        if (m) m.style.display = "block";
      } else if (current) {
        current.style.display = "block";
      }
    } else {
      sections.forEach(sec => (sec.style.display = ""));
    }
    displayMantingal();
  });
}

// ========================= API načítanie =========================
async function fetchMatches() {
  try {
    const response = await fetch(`${API_BASE}/api/matches`, { cache: "no-store" });
    const data = await response.json();

    let matches = [];

    // 1) Máme rounds? (pôvodný formát)
    if (Array.isArray(data.rounds) && data.rounds.length > 0) {
      allMatches = data.rounds.flatMap(r => r.matches);

      matches = allMatches.map(m => ({
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
        round: (() => {
          const date = new Date(m.sport_event.start_time).toISOString().slice(0, 10);
          const foundRound = data.rounds.find(r => r.date === date);
          return foundRound ? foundRound.round : null;
        })(),
        date: new Date(m.sport_event.start_time).toISOString().slice(0, 10)
      }));

    // 2) NHL raw objekty? (potrebujú normalizeNhlGame)
    } else if (Array.isArray(data.matches) && data.matches.length > 0 && data.matches[0] && (data.matches[0].homeTeam || data.matches[0].awayTeam)) {
      const rawMatches = data.matches;
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

    // 3) Zjednodušené zápasy z tvojho backendu (/api/matches) – PRIAMO POUŽIŤ
    } else if (Array.isArray(data.matches) && data.matches.length > 0 && data.matches[0] && ( "home_team" in data.matches[0] )) {
      // pre tabuľku používame priamo
      matches = data.matches.map(m => ({
        id: m.id,
        home_id: m.home_team,
        away_id: m.away_team,
        home_team: m.home_team,
        away_team: m.away_team,
        home_score: m.home_score ?? 0,
        away_score: m.away_score ?? 0,
        status: m.status,
        overtime: false,
        ap: String(m.status || "").toLowerCase() === "ap",
        date: m.date
      }));

      // aby Mantingal nepadal, nasypeme minimálny extraliga tvar (bez štatistík)
      allMatches = data.matches.map(minimalExtraligaFromSimple);
    } else {
      matches = [];
      allMatches = [];
    }

    // Zoradenie: od najnovšieho dňa
    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render
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

  // iba odohrané / live zápasy
  const completed = matches.filter(m =>
    m.status === "closed" || m.status === "ap" || m.status === "final" || m.status === "FINAL"
  );

  if (completed.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  // zoradiť od najnovšieho dátumu k najstaršiemu
  completed.sort((a, b) => new Date(b.date) - new Date(a.date));

  // skupiny podľa dňa
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

      let statusText = "";
      const st = String(match.status || "").toLowerCase();
      if (st === "closed" || st === "final") {
        statusText = match.overtime || match.ap ? "✅ PP" : "✅";
      } else if (st === "ap" || st === "live") {
        statusText = "✅ PP";
      }

      row.innerHTML = `
        <td>${match.home_team}</td>
        <td>${match.away_team}</td>
        <td>${homeScore} : ${awayScore}</td>
        <td>${statusText}</td>
      `;

      // klik na detail zápasu – ak máme match-details endp.
      row.style.cursor = "pointer";
      row.addEventListener("click", async () => {
        const existingDetails = row.nextElementSibling;
        if (existingDetails && existingDetails.classList.contains("details-row")) {
          existingDetails.remove();
          return;
        }

        try {
          const endpoint = `${API_BASE}/api/match-details?gameId=${encodeURIComponent(match.id)}`;
          const response = await fetch(endpoint);
          const data = await response.json();

          document.querySelectorAll(".details-row").forEach(el => el.remove());

          const detailsRow = document.createElement("tr");
          detailsRow.classList.add("details-row");

          const detailsCell = document.createElement("td");
          detailsCell.colSpan = 4;

          const periods = `/${(data.sport_event_status?.period_scores || [])
            .map(p => `${p.home_score}:${p.away_score}`)
            .join("; ")}/`;

          detailsCell.innerHTML = `
            <div class="details-box">
              <h4>Skóre: ${data.sport_event_status?.home_score ?? "-"} : ${data.sport_event_status?.away_score ?? "-"}</h4>
              <p><b>Po tretinách:</b> ${periods}</p>
            </div>
          `;

          detailsRow.appendChild(detailsCell);
          row.insertAdjacentElement("afterend", detailsRow);
        } catch (err) {
          console.error("Chyba pri načítaní detailov zápasu:", err);
        }
      });

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

  if (sortedTeams.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="2">—</td></tr>`;
    return;
  }

  sortedTeams.forEach(([team, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${team}</td><td>${rating}</td>`;

    // klik na riadok tímu -> načítanie štatistík (len ak máš /api/team/:id)
    row.style.cursor = "pointer";
    row.addEventListener("click", async () => {
      const id = TEAM_IDS[team];
      if (!id) return;

      const existing = row.nextElementSibling;
      if (existing && existing.classList.contains("team-stats-row")) {
        existing.remove();
        return;
      }

      try {
        const resp = await fetch(`${API_BASE}/api/team/${encodeURIComponent(id)}`);
        const stats = await resp.json();

        document.querySelectorAll(".team-stats-row").forEach(el => el.remove());

        const detailsRow = document.createElement("tr");
        detailsRow.classList.add("team-stats-row");
        detailsRow.innerHTML = `
          <td colspan="2">
            <div><b>Výhry:</b> ${stats.wins}</div>
            <div><b>Prehry:</b> ${stats.losses}</div>
            <div><b>Strelené góly:</b> ${stats.goalsFor}</div>
            <div><b>Obdržané góly:</b> ${stats.goalsAgainst}</div>
          </td>
        `;
        row.insertAdjacentElement("afterend", detailsRow);
      } catch (err) {
        console.error("Chyba pri načítaní štatistík tímu:", err);
      }
    });

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
    tableBody.innerHTML = `<tr><td colspan="2">Dáta hráčov zatiaľ nepripojené</td></tr>`;
    return;
  }

  sortedPlayers.forEach(([player, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${player}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

/** ============================================================
 *  MANTINGAL – simulácia sezóny + denník
 *  (zapne sa až keď budeme mať hráčske štatistiky v allMatches)
 *  ============================================================ */
function displayMantingal() {
  // render len ak máme štatistiky
  const hasStats = (allMatches || []).some(
    m => m.statistics && m.statistics.totals && Array.isArray(m.statistics.totals.competitors)
  );

  const pcWrapper = document.querySelector("#players-section");
  const mobileWrapper = document.getElementById("mantingal-container");

  if (pcWrapper) {
    const oldPc = pcWrapper.querySelector("#mantingal-wrapper-pc");
    if (oldPc) oldPc.remove();
  }
  if (mobileWrapper) {
    mobileWrapper.innerHTML = "";
  }

  if (!hasStats) {
    // nič nerenderuj (na stránke máš vlastný text „Mantingal sa zapne…“)
    return;
  }

  // (pôvodná logika by pokračovala tu – nechávam ju vypnutú, kým nepripojíme boxscore)
}

// ========================= START =========================
window.addEventListener("DOMContentLoaded", () => {
  setupMobileSectionsOnLoad();
  fetchMatches();
});
