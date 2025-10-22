// public/app.js


// === STANDINGS ===
async function displayStandings() {
  console.log("📊 [STANDINGS] Načítavam dáta...");
  try {
    const res = await fetch("/api/nhl?type=standings");
    const data = await res.json();
    console.log("✅ [STANDINGS] Dáta:", data);

    const teams = data?.standings?.[0]?.teamRecords || [];
    const body = document.querySelector("#standings-table tbody");

    if (!teams.length) {
      body.innerHTML = `<tr><td colspan="5">Žiadne dáta</td></tr>`;
      console.warn("⚠️ [STANDINGS] Prázdne pole standings");
      return;
    }

    body.innerHTML = teams
      .sort((a, b) => b.points - a.points)
      .slice(0, 7)
      .map(
        t => `<tr>
                <td>${t.teamName?.default || "?"}</td>
                <td>${t.gamesPlayed}</td>
                <td>${t.wins}</td>
                <td>${t.losses}</td>
                <td>${t.points}</td>
              </tr>`
      )
      .join("");
  } catch (err) {
    console.error("❌ [STANDINGS] Chyba:", err);
  }
}

// === SCOREBOARD ===
async function displayScoreboard() {
  console.log("🏒 [SCOREBOARD] Načítavam zápasy...");
  try {
    const res = await fetch("/api/nhl?type=scoreboard");
    const data = await res.json();
    console.log("✅ [SCOREBOARD] Dáta:", data);

    const games = data?.games || [];
    const body = document.querySelector("#scoreboard-table tbody");
    if (!games.length) {
      body.innerHTML = `<tr><td colspan="4">Žiadne zápasy</td></tr>`;
      return;
    }

    body.innerHTML = games
      .slice(0, 7)
      .map(g => `
        <tr>
          <td>${g.homeTeam?.teamName?.default || g.homeTeam?.abbrev || "-"}</td>
          <td>${g.awayTeam?.teamName?.default || g.awayTeam?.abbrev || "-"}</td>
          <td>${g.homeTeam?.score ?? "-"} : ${g.awayTeam?.score ?? "-"}</td>
          <td>${g.gameState || "-"}</td>
        </tr>
      `)
      .join("");
  } catch (err) {
    console.error("❌ [SCOREBOARD] Chyba:", err);
  }
}

// === ODDS ===
async function displayOdds() {
 const container = document.querySelector("#nhl-section");
  if (!container) return;

  container.innerHTML = `<h2>📊 NHL Kurzy (DraftKings)</h2><p>Načítavam...</p>`;

  try {
    const res = await fetch("/api/nhl-proxy?type=odds");
    const data = await res.json();
    const games = data.games || [];

    if (!games.length) {
      container.innerHTML += "<p>Žiadne zápasy</p>";
      return;
    }

    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>Domáci</th>
          <th>Hostia</th>
          <th>1 (home)</th>
          <th>2 (away)</th>
          <th>Dátum</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    games.slice(0, 10).forEach(g => {
      const home = g.homeTeam.name?.default || g.homeTeam.abbrev;
      const away = g.awayTeam.name?.default || g.awayTeam.abbrev;

      // nájdi MONEY_LINE_2_WAY kurz
      function toDecimal(american) {
      if (american == null || isNaN(american)) return "-";
      if (american > 0) return ((american / 100) + 1).toFixed(2);
      else return ((100 / Math.abs(american)) + 1).toFixed(2);
    }

    const homeRaw = g.homeTeam.odds?.find(o => o.description === "MONEY_LINE_2_WAY")?.value;
    const awayRaw = g.awayTeam.odds?.find(o => o.description === "MONEY_LINE_2_WAY")?.value;

    const homeOdds = toDecimal(homeRaw);
    const awayOdds = toDecimal(awayRaw);

      const date = new Date(g.startTimeUTC).toLocaleString("sk-SK", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit"
      });

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><img src="${g.homeTeam.logo}" width="40"> ${home}</td>
        <td><img src="${g.awayTeam.logo}" width="40"> ${away}</td>
        <td>${homeOdds}</td>
        <td>${awayOdds}</td>
        <td>${date}</td>
      `;
      tbody.appendChild(row);
    });

    container.innerHTML = `
      <h2>📊 NHL Kurzy (DraftKings)</h2>
      <p>Aktualizované: ${data.lastUpdatedUTC}</p>
    `;
    container.appendChild(table);

  } catch (err) {
    console.error("❌ Chyba pri fetchnutí odds:", err);
    container.innerHTML += `<p>Chyba pri načítaní dát: ${err.message}</p>`;
  }
}

// === WHERE TO WATCH ===
async function displayWhereToWatch() {
  console.log("📺 [WATCH] Načítavam platformy...");
  try {
    const res = await fetch("/api/nhl?type=watch");
    const data = await res.json();
    console.log("✅ [WATCH] Dáta:", data);

    const channels = data?.providers || [];
    const list = document.querySelector("#watch-list");

    list.innerHTML = channels
      .slice(0, 5)
      .map(p => `<li>${p.name} – ${p.platform}</li>`)
      .join("");
  } catch (err) {
    console.error("❌ [WATCH] Chyba:", err);
  }
}

// === PLAYERS ===
async function displayPlayers() {
  console.log("👤 [PLAYERS] Načítavam hráčov...");
  try {
    const res = await fetch("/api/nhl?type=players");
    const data = await res.json();
    console.log("✅ [PLAYERS] Dáta:", data);

    const players = data?.data || [];
    const body = document.querySelector("#players-table tbody");
    if (!players.length) {
      body.innerHTML = `<tr><td colspan="3">Žiadni hráči</td></tr>`;
      return;
    }

    body.innerHTML = players
      .slice(0, 10)
      .map(
        p => `<tr><td>${p.firstName} ${p.lastName}</td><td>${p.teamAbbrevs}</td><td>${p.gamesPlayed}</td></tr>`
      )
      .join("");
  } catch (err) {
    console.error("❌ [PLAYERS] Chyba:", err);
  }
}

// === Načítanie NHL sekcie ===
async function loadNhlSection() {
  console.log("🔹 Načítavam NHL sekciu...");
  try {
    await displayStandings();
    await displayScoreboard();
    await displayOdds();
    await displayWhereToWatch();
    await displayPlayers();
    console.log("✅ NHL sekcia načítaná");
  } catch (e) {
    console.error("❌ Chyba pri načítaní NHL sekcie:", e);
  }
}


// 🏁 Spusti po kliknutí na NHL alebo pri načítaní stránky
document.querySelector("button[onclick*='nhl-section']")
  ?.addEventListener("click", loadNhlSection);

// alebo spusti hneď po načítaní (ak chceš testovať)
window.addEventListener("DOMContentLoaded", loadNhlSection);

















let teamRatings = {};
let playerRatings = {};
let allMatches = [];

const BASE_STAKE = 1;
const ODDS = 2.5;
const API_BASE = "";

// === Nastavenie dátumov pre sezónu 2025/26 ===
const START_DATE = "2025-04-01"; // prvé zápasy novej sezóny
const TODAY = "2025-04-10" //new Date().toISOString().slice(0, 10); // dnešný dátum

// === Pomocné funkcie ===
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
const slug = (s) => encodeURIComponent(String(s || "").toLowerCase().replace(/\s+/g, "-"));

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

// === Normalizácia dát NHL API na formát appky ===
function nhlTeamName(t) {
  if (!t) return "Neznámy tím";
  const place = t.placeName?.default || "";
  const common = t.commonName?.default || "";
  const combo = `${place} ${common}`.trim();
  return combo || t.triCode || t.abbrev || "Tím";
}

function normalizeNhlGame(game, day) {
  let status = "not_started";
  const st = String(game.gameState || "").toUpperCase();
  if (st === "FINAL" || st === "OFF") status = "closed";
  else if (st === "LIVE") status = "ap";

  const homeScore = game.homeTeam?.score ?? 0;
  const awayScore = game.awayTeam?.score ?? 0;

  return {
    id: game.id,
    sport_event: {
      id: String(game.id || ""),
      start_time: game.startTimeUTC || game.startTime || day,
      competitors: [
        { id: String(game.homeTeam?.id || "HOME"), name: nhlTeamName(game.homeTeam) },
        { id: String(game.awayTeam?.id || "AWAY"), name: nhlTeamName(game.awayTeam) }
      ]
    },
    sport_event_status: {
      status,
      home_score: homeScore,
      away_score: awayScore,
      overtime: false,
      ap: status === "ap"
    },
    _day: day
  };
}

// === Fetch schedule od 8.10.2025 do dnes ===
async function fetchNhlSchedule() {
  const games = [];
  for (const day of dateRange(START_DATE, TODAY)) {
    try {
      const url = `https://api-web.nhle.com/v1/schedule/${day}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const groups = Array.isArray(data.gameWeek) ? data.gameWeek : [];
      groups.forEach(g => {
        const dayGames = Array.isArray(g.games) ? g.games : [];
        dayGames.forEach(game => {
          if (["FINAL", "OFF"].includes(String(game.gameState || "").toUpperCase())) {
            games.push(normalizeNhlGame(game, day));
          }
        });
      });
      console.log(`✅ ${day} – načítané ${games.length} zápasov`);
    } catch (e) {
      console.warn(`⚠️ Chyba pri dni ${day}: ${e.message}`);
    }
  }
  console.log(`🔹 Spolu odohraných zápasov: ${games.length}`);
  return games;
}

// === Výpočet ratingov tímov ===
function computeTeamRatings(matches) {
  const START_RATING = 1500;
  const GOAL_POINTS = 10;
  const WIN_POINTS = 10;
  const LOSS_POINTS = -10;

  const ratings = {};
  const ensure = (team) => { if (ratings[team] == null) ratings[team] = START_RATING; };

  matches.forEach(m => {
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

// === Hlavné načítanie ===
// ========================= API načítanie =========================
async function fetchMatches() {
  try {
    const response = await fetch(`${API_BASE}/api/matches`);
    const data = await response.json();

    console.log("✅ Dáta z backendu:", data);

    // NHL formát – očakávame pole data.matches
    const matches = Array.isArray(data.matches) ? data.matches : [];

    if (matches.length === 0) {
      console.warn("⚠️ Žiadne zápasy v data.matches");
    }

    // pre transformáciu do pôvodného tvaru
    const normalized = matches.map((g) => ({
      id: g.id,
      date: g.date,
      sport_event: {
        start_time: g.start_time,
        competitors: [
          { name: g.home_team },
          { name: g.away_team }
        ]
      },
      sport_event_status: {
        status: g.status,
        home_score: g.home_score,
        away_score: g.away_score
      }
    }));

    allMatches = normalized; // pre Mantingal

    // pre tabuľku zápasov
    const simplified = normalized.map((m) => ({
      id: m.id,
      home_team: m.sport_event.competitors[0].name,
      away_team: m.sport_event.competitors[1].name,
      home_score: m.sport_event_status.home_score,
      away_score: m.sport_event_status.away_score,
      status: m.sport_event_status.status,
      date: new Date(m.sport_event.start_time).toISOString().slice(0, 10)
    }));

    simplified.sort((a, b) => new Date(b.date) - new Date(a.date));

    displayMatches(simplified);

    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};

    displayTeamRatings();
    displayPlayerRatings();
    displayMantingal();
  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
  }
}

// === Zápasy ===
function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (!matches.length) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  const grouped = {};
  matches.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  });

  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  days.forEach((day, i) => {
    const roundRow = document.createElement("tr");
    roundRow.innerHTML = `<td colspan="4"><b>${i + 1}. deň (${day})</b></td>`;
    tableBody.appendChild(roundRow);

    grouped[day].forEach(match => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${match.home_team}</td>
        <td>${match.away_team}</td>
        <td>${match.home_score} : ${match.away_score}</td>
        <td>${match.status === "closed" ? "✅" : "🟡"}</td>
      `;
      tableBody.appendChild(row);
    });
  });
}

// === Rating tímov ===
function displayTeamRatings() {
  const tableBody = document.querySelector("#teamRatings tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const sorted = Object.entries(teamRatings).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([team, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${team}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

// === Rating hráčov ===
function displayPlayerRatings() {
  const tableBody = document.querySelector("#playerRatings tbody");
  if (!tableBody) return;

  if (!playerRatings || Object.keys(playerRatings).length === 0) {
    tableBody.innerHTML = `<tr><td colspan="2">Dáta hráčov zatiaľ nepripojené</td></tr>`;
    return;
  }

  // Zoradíme hráčov podľa ratingu (od najlepšieho)
  const sorted = Object.entries(playerRatings).sort((a, b) => b[1] - a[1]);

  tableBody.innerHTML = ""; // vyčisti tabuľku

  sorted.forEach(([player, rating], index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}. ${player}</td>
      <td>${rating}</td>
    `;
    tableBody.appendChild(row);
  });
}

// === Mantingal placeholder ===
function displayMantingal() {
  const wrap = document.getElementById("mantingal-container");
  if (!wrap) return;
  wrap.innerHTML = `
    <table><tr><td>Mantingal sa zapne po pripojení hráčskych štatistík (boxscore).</td></tr></table>
  `;
}

// === Predikcie – Kurzy bookmakerov ===
async function displayPredictions() {
  const container = document.getElementById("predictions-section");
  if (!container) return;

  container.innerHTML = `
    <h2>Predikcie – Kurzy bookmakerov</h2>
    <p>Načítavam aktuálne kurzy...</p>
  `;

  try {
    const resp = await fetch("/api/predictions");
    const data = await resp.json();

    if (!data.games?.length) {
      container.innerHTML = "<p>Žiadne dostupné kurzy</p>";
      return;
    }

    const list = document.createElement("div");
    list.className = "odds-blocks";

    data.games.forEach(game => {
      const home = game.homeTeam || "-";
      const away = game.awayTeam || "-";
      const homeLogo = game.homeLogo || "";
      const awayLogo = game.awayLogo || "";
      const homeOdds = game.homeOdds ?? "-";
      const awayOdds = game.awayOdds ?? "-";

      const match = document.createElement("div");
      match.className = "odds-match";
      match.innerHTML = `
        <div class="match-header">
          <img src="${homeLogo}" alt="${home}" class="team-logo">
          <span class="team-name">${home}</span>
          <span class="vs">–</span>
          <span class="team-name">${away}</span>
          <img src="${awayLogo}" alt="${away}" class="team-logo">
        </div>

        <div class="odds-row">
          <div class="odds-cell"><b>1</b><br>${homeOdds}</div>
          <div class="odds-cell"><b>2</b><br>${awayOdds}</div>
        </div>
      `;
      list.appendChild(match);
    });

    container.innerHTML = `<h2>Predikcie – Kurzy bookmakerov</h2>`;
    container.appendChild(list);

  } catch (err) {
    console.error("❌ Chyba pri načítaní predikcií:", err);
    container.innerHTML = `<p>Chyba pri načítaní kurzov: ${err.message}</p>`;
  }
}

// 🔁 Načítaj predikcie, keď sa otvorí sekcia
document
  .querySelector("button[onclick*='predictions-section']")
  ?.addEventListener("click", displayPredictions);

// === Štart ===
window.addEventListener("DOMContentLoaded", () => {
  fetchMatches();
  displayPredictions(); // 🔹 pridaj túto funkciu
  loadNhlSection(); // 🏒 pridaj túto funkciu
});
