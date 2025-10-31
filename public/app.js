/* =========================
   app.js — NHL sekcia + init
   ========================= */

/* ---------- Pomocné utilky ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function formatYMD(dateLike) {
  // YYYY-MM-DD (napr. na rozsahy)
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

function formatTimeLocal(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return "-";
  const wd = d.toLocaleDateString("sk-SK", { weekday: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${wd} ${hh}:${mm}`;
}

/* ---------- NHL render guard ---------- */
let NHL_INIT_DONE = false;

/* ---------- STANDINGS ---------- */
async function displayStandings() {
  const tbody = document.querySelector("#standings-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5">Načítavam...</td></tr>`;

  try {
    const res = await fetch("/api/nhl-proxy?type=standings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // data.standings je pole sekcií. Chceme overall/league.
    const sections = Array.isArray(data?.standings) ? data.standings : [];
    const pick =
      sections.find(s =>
        /overall|league/i.test(s?.standingsType || s?.type || s?.label || "")
      )
      || sections.find(s => Array.isArray(s?.teamRecords) && s.teamRecords.length)
      || { teamRecords: [] };

    const rows = Array.isArray(pick.teamRecords) ? pick.teamRecords : [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5">Žiadne dáta</td></tr>`;
      return;
    }

    const name = t =>
      t.teamName?.default || t.teamCommonName?.default || t.team?.name || t.team?.abbrev || "-";
    const gp  = t => t.gamesPlayed ?? t.gp ?? "-";
    const w   = t => t.wins ?? t.w ?? "-";
    const l   = t => t.losses ?? t.l ?? "-";
    const pts = t => t.points ?? t.pts ?? 0;

    tbody.innerHTML = rows
      .slice()
      .sort((a, b) => Number(pts(b)) - Number(pts(a)))
      .map(t => `
        <tr>
          <td>${name(t)}</td>
          <td>${gp(t)}</td>
          <td>${w(t)}</td>
          <td>${l(t)}</td>
          <td>${pts(t)}</td>
        </tr>
      `).join("");
  } catch (e) {
    console.error("❌ [STANDINGS] Chyba:", e);
    tbody.innerHTML = `<tr><td colspan="5">API dočasne nedostupné.</td></tr>`;
  }
}




/* ---------- SCOREBOARD (prebiehajúce/zapasy dňa) ---------- */
// === STANDINGS (deep-scan verzia) ===
function formatTimeLocal(v){
  const d = new Date(v);
  if (isNaN(d)) return "-";
  const wd = d.toLocaleDateString("sk-SK",{weekday:"short"});
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${wd} ${hh}:${mm}`;
}

async function displayScoreboard() {
  const tbody = document.querySelector("#scoreboard-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4">Načítavam...</td></tr>`;

  try {
    const res = await fetch("/api/nhl-proxy?type=scoreboard");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // API typicky: gamesByDate[ { date, games: [...] } ]
    const byDate = Array.isArray(data?.gamesByDate) ? data.gamesByDate : [];
    const games = byDate.flatMap(d => d.games || []);

    if (!games.length) {
      tbody.innerHTML = `<tr><td colspan="4">Žiadne zápasy</td></tr>`;
      return;
    }

    const team = t => t?.teamName?.default || t?.abbrev || t?.name || "-";
    const stateRank = s => ({ LIVE:0, LIVE_CRIT:0, PRE:1, FUT:1, FINAL:2, OFF:3 }[s] ?? 3);
    const start = g => new Date(g.startTimeUTC || g.startTime || g.gameDate || 0).getTime();
    const status = g => {
      const st = g.gameState || g.gameStatus || "";
      const pd = g.periodDescriptor || {};
      const clock = g.clock?.timeRemaining || g.clock?.timeRemainingFormatted || "";
      if (st === "LIVE" || st === "LIVE_CRIT") {
        const per = pd.number ? `P${pd.number}` : (pd.periodType || "LIVE");
        return clock ? `${per} • ${clock}` : per;
      }
      if (st === "FINAL") {
        const extra = (pd.periodType === "OT" || pd.periodType === "SO") ? ` • ${pd.periodType}` : "";
        return `Final${extra}`;
      }
      if (st === "PRE" || st === "FUT") return formatTimeLocal(g.startTimeUTC || g.startTime);
      return st || "-";
    };

    const rows = games
      .slice()
      .sort((a,b) => stateRank(a.gameState)-stateRank(b.gameState) || start(a)-start(b))
      .map(g => `
        <tr class="${(g.gameState||"").toLowerCase()}">
          <td>${team(g.homeTeam)}</td>
          <td>${team(g.awayTeam)}</td>
          <td>${g.homeTeam?.score ?? "-"} : ${g.awayTeam?.score ?? "-"}</td>
          <td>${status(g)}</td>
        </tr>
      `).join("");

    tbody.innerHTML = rows;
  } catch (e) {
    console.error("❌ [SCOREBOARD] Chyba:", e);
    tbody.innerHTML = `<tr><td colspan="4">API dočasne nedostupné.</td></tr>`;
  }
}

// zistí, či objekt vyzerá ako "záznam tímu" zo standings
function looksLikeTeamRecord(x) {
  if (!x || typeof x !== "object") return false;
  const nameOk =
    x.teamName?.default || x.teamName || x.team?.name || x.team?.commonName || x.abbrev;
  const ptsOk =
    typeof x.points === "number" || typeof x.pts === "number" || typeof x.pointTotal === "number";
  const gpOk =
    typeof x.gamesPlayed === "number" || typeof x.gp === "number" || typeof x.games === "number";
  return !!(nameOk && (ptsOk || gpOk));
}

// prehľadá ľubovoľný JSON do hĺbky a pozbiera polia, ktoré vyzerajú ako pole teamRecords
function deepFindTeamArrays(root) {
  const out = [];
  const seen = new Set();
  (function visit(n) {
    if (!n || typeof n !== "object") return;
    if (seen.has(n)) return;
    seen.add(n);

    if (Array.isArray(n)) {
      if (n.length && typeof n[0] === "object" && looksLikeTeamRecord(n[0])) out.push(n);
      for (const v of n) visit(v);
      return;
    }
    for (const k in n) visit(n[k]);
  })(root);
  return out;
}

// bezpečné čítačky
const teamNameOf = (t) =>
  t.teamName?.default ||
  t.teamCommonName?.default ||
  t.teamCommonName ||
  t.teamName ||
  t.team?.name ||
  t.team?.commonName ||
  t.team?.abbrev ||
  t.abbrev ||
  "-";

const gpOf  = (t) => t.gamesPlayed ?? t.gp ?? t.games ?? "-";
const wOf   = (t) => t.wins ?? t.w ?? "-";
const lOf   = (t) => t.losses ?? t.l ?? "-";
const ptsOf = (t) => t.points ?? t.pts ?? t.pointTotal ?? 0;

async function displayStandings() {
  const tbody = document.querySelector("#standings-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5">Načítavam...</td></tr>`;

  try {
    const res = await fetch("/api/nhl-proxy?type=standings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 1) nájdi všetky kandidátske polia kdekoľvek v odpovedi
    const candidates = deepFindTeamArrays(data);

    // 2) vyber najlepší kandidát (najdlhšie pole)
    const rows = candidates.sort((a, b) => b.length - a.length)[0] || [];

    if (!rows.length) {
      console.warn("[STANDINGS] nenašiel som teamRecords, kľúče odpovede:", Object.keys(data || {}));
      tbody.innerHTML = `<tr><td colspan="5">Žiadne dáta</td></tr>`;
      return;
    }

    // 3) zoradenie a render
    tbody.innerHTML = rows
      .slice()
      .sort((a, b) => Number(ptsOf(b)) - Number(ptsOf(a)))
      .map((t) => `
        <tr>
          <td>${teamNameOf(t)}</td>
          <td>${gpOf(t)}</td>
          <td>${wOf(t)}</td>
          <td>${lOf(t)}</td>
          <td>${ptsOf(t)}</td>
        </tr>
      `)
      .join("");
  } catch (e) {
    console.error("❌ [STANDINGS] Chyba:", e);
    tbody.innerHTML = `<tr><td colspan="5">API dočasne nedostupné.</td></tr>`;
  }
}



/* ---------- ODDS (decimálne kurzy) ---------- */
async function displayOdds() {
  const tbody = document.querySelector("#odds-table tbody");
  const updatedEl = document.getElementById("odds-updated");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5">Načítavam...</td></tr>`; // 5 stĺpcov: Domáci, Hostia, 1, 2, Čas

  try {
    const r = await fetch("/api/nhl-proxy?type=odds");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const games = Array.isArray(data?.games) ? data.games : [];

    if (!games.length) {
      tbody.innerHTML = `<tr><td colspan="5">Žiadne zápasy / kurzy</td></tr>`;
      updatedEl && (updatedEl.textContent = "");
      return;
    }

    tbody.innerHTML = games.map(g => {
      // názvy tímov
      const homeName = g.homeTeam?.name?.default || g.homeTeam?.abbrev || "-";
      const awayName = g.awayTeam?.name?.default || g.awayTeam?.abbrev || "-";

      // >>> tvoje dve riadky – POZOR: tu používaj "g", nie "game"
      const h = g?.homeTeam?.odds?.find(o => o.description?.startsWith("MONEY_LINE_2_WAY"))?.value ?? null;
      const a = g?.awayTeam?.odds?.find(o => o.description?.startsWith("MONEY_LINE_2_WAY"))?.value ?? null;
      // (covers aj "MONEY_LINE_2_WAY_INB", lebo startsWith)

      // čas
      const dt = g.startTimeUTC || g.startTime || g.gameDate || "";
      const d = new Date(dt);
      const time = isNaN(d) ? "-" :
        `${d.toLocaleDateString("sk-SK",{weekday:"short"})} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;

      return `
        <tr>
          <td>${homeName}</td>
          <td>${awayName}</td>
          <td>${h ?? "-"}</td>
          <td>${a ?? "-"}</td>
          <td>${time}</td>
        </tr>
      `;
    }).join("");

    updatedEl && (updatedEl.textContent = `Aktualizované: ${data.lastUpdatedUTC || new Date().toISOString()}`);
  } catch (e) {
    console.error("ODDS:", e);
    tbody.innerHTML = `<tr><td colspan="5">API dočasne nedostupné.</td></tr>`;
    updatedEl && (updatedEl.textContent = "");
  }
}




/* ---------- WHERE TO WATCH ---------- */
async function displayWhereToWatch() {
  const list = $("#watch-list");
  if (!list) return;
  list.innerHTML = `<li>Načítavam...</li>`;

  try {
    const res = await fetch("/api/nhl-proxy?type=watch");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // rôzne názvy polí z NHL webu
    const providers =
      (Array.isArray(data?.providers) && data.providers) ||
      (Array.isArray(data?.partners)  && data.partners)  ||
      (Array.isArray(data?.entries)   && data.entries)   ||
      [];

    if (!providers.length) {
      list.innerHTML = `<li>Žiadne údaje</li>`;
      return;
    }

    list.innerHTML = providers.slice(0, 12).map(p => {
      const name = p.name || p.providerName || p.platform || p.channel || "Poskytovateľ";
      const region = p.country || p.region || p.locale || "";
      return `<li>${name}${region ? ` — ${region}` : ""}</li>`;
    }).join("");
  } catch (e) {
    console.error("❌ [WATCH] Chyba:", e);
    list.innerHTML = `<li>API dočasne nedostupné.</li>`;
  }
}


/* ---------- PLAYERS (Top hráči) ---------- */
async function displayPlayers() {
  const tbody = $("#players-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3">Načítavam...</td></tr>`;

  try {
    const res  = await fetch("/api/nhl-proxy?type=players");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const players = Array.isArray(data?.data) ? data.data : [];

    if (!players.length) {
      tbody.innerHTML = `<tr><td colspan="3">Žiadni hráči</td></tr>`;
      return;
    }

    tbody.innerHTML = players.slice(0, 12).map(p => `
      <tr>
        <td>${[p.firstName, p.lastName].filter(Boolean).join(" ")}</td>
        <td>${p.teamAbbrevs || p.teamAbbrev || "-"}</td>
        <td>${p.gamesPlayed ?? p.gp ?? "-"}</td>
      </tr>
    `).join("");
  } catch (e) {
    console.error("❌ [PLAYERS] Chyba:", e);
    tbody.innerHTML = `<tr><td colspan="3">API dočasne nedostupné.</td></tr>`;
  }
}

/* ---------- Loader pre NHL sekciu (spustiť len raz) ---------- */

async function loadNhlSection() {
  if (NHL_INIT_DONE) return;
  NHL_INIT_DONE = true;
  displayStandings();
  displayScoreboard();
  displayOdds();
  displayWhereToWatch();
  //displayPlayers();
}
(function init(){
  const start = () => {
    try { loadNhlSection(); console.log("✅ Inicializované: NHL sekcia načítaná"); }
    catch(e){ console.error("❌ Init error:", e); }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once:true });
  } else {
    start();
  }
})();

/* ---------- Ostatné tvoje sekcie (placeholders, aby nič nepadalo) ---------- */
// Ak máš vlastné implementácie, nechaj si ich. Tieto sú len bezpečné „no-op“, aby nepadali volania nižšie.
function fetchMatches() { /* tvoje výsledky – nechaj prázdne, ak nepoužívaš */ }
function displayPredictions() { /* tvoje predikcie – nechaj prázdne, ak nepoužívaš */ }

/* ---------- Inicializácia po načítaní DOM ---------- */
(function init() {
  // pre istotu: nespúšťaj dvakrát (niekedy bundlery/SPA fire-uju DOMContentLoaded duplicitne)
  const start = () => {
    try {
      fetchMatches();
      displayPredictions();
      loadNhlSection();
      console.log("✅ Inicializované: NHL sekcia načítaná");
    } catch (e) {
      console.error("❌ Init error:", e);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
