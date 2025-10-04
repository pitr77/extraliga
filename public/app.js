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
    // desktop – necháme CSS (3 stĺpce), nič neschovávame tu
    sections.forEach(sec => (sec.style.display = ""));
  }

  // Pre istotu: keď používateľ prepína, re-renderujeme Mantingal pre mobil
  select.addEventListener("change", () => {
    if (isMobile()) {
      if (select.value === "mantingal") {
        // pri otvorení sekcie mantingal sprav render len do mobil kontajnera
        displayMantingal();
      }
    }
  });

  // Pri zmene veľkosti okna pre-render aby sa neobjavili duplicity
  window.addEventListener("resize", () => {
    // Prepneme zobrazenie sekcií korektne
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
    // a pre-render Mantingal do správneho kontajnera podľa režimu
    displayMantingal();
  });
}

// ========================= API načítanie =========================
async function fetchMatches() {
  try {
    const response = await fetch(`${API_BASE}/api/matches`);
    const data = await response.json();

    allMatches = data.matches || [];

    const matches = allMatches.map(match => ({
      home_id: match.sport_event.competitors[0].id,
      away_id: match.sport_event.competitors[1].id,
      home_team: match.sport_event.competitors[0].name,
      away_team: match.sport_event.competitors[1].name,
      home_score: match.sport_event_status.home_score,
      away_score: match.sport_event_status.away_score,
      status: match.sport_event_status.status,
      overtime: match.sport_event_status.overtime,
      ap: match.sport_event_status.ap
    }));

    displayMatches(matches);

    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};

    displayTeamRatings();
    displayPlayerRatings();
    displayMantingal(); // korektný prepočet + denník (render do PC alebo mobil kontajnera)
  } catch (err) {
    console.error("Chyba pri načítaní zápasov:", err);
  }
}

// ========================= Zápasy =========================
function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  matches.forEach(match => {
    const homeScore = match.home_score ?? "-";
    const awayScore = match.away_score ?? "-";

    const row = document.createElement("tr");

    let statusText = "";
    if (match.status === "closed") {
      statusText = match.overtime || match.ap ? "✅ PP" : "✅";
    } else if (match.status === "ap") {
      statusText = "✅ PP";
    } else if (match.status === "not_started") {
      statusText = "⏳";
    }

    row.innerHTML = `
      <td>${match.home_team}</td>
      <td>${match.away_team}</td>
      <td>${homeScore} : ${awayScore}</td>
      <td>${statusText}</td>
    `;

    // klik na detail (rozbalí pod riadok)
    row.style.cursor = "pointer";
    row.addEventListener("click", async () => {
      const existingDetails = row.nextElementSibling;
      if (existingDetails && existingDetails.classList.contains("details-row")) {
        existingDetails.remove();
        return;
      }

      try {
        const endpoint = `${API_BASE}/api/match-details?homeId=${match.home_id}&awayId=${match.away_id}`;
        const response = await fetch(endpoint);
        const data = await response.json();

        // odstráň iné otvorené detaily
        document.querySelectorAll(".details-row").forEach(el => el.remove());

        const detailsRow = document.createElement("tr");
        detailsRow.classList.add("details-row");

        const detailsCell = document.createElement("td");
        detailsCell.colSpan = 4;

        const periods = `/${(data.sport_event_status.period_scores || [])
          .map(p => `${p.home_score}:${p.away_score}`)
          .join("; ")}/`;

        const homeTeam = data.statistics?.totals?.competitors?.find?.(t => t.qualifier === "home") || { name: "Domáci", players: [] };
        const awayTeam = data.statistics?.totals?.competitors?.find?.(t => t.qualifier === "away") || { name: "Hostia", players: [] };

        const formatPlayers = team =>
          (team.players || [])
            .filter(p => (p.statistics?.goals || 0) > 0 || (p.statistics?.assists || 0) > 0)
            .map(p => `
              <div class="player-line">
                <span class="player-name">${p.name}</span> –
                ${(p.statistics?.goals || 0)} g + ${(p.statistics?.assists || 0)} a
              </div>
            `)
            .join("") || "<div class='player-line'>Žiadne góly</div>";

        detailsCell.innerHTML = `
          <div class="details-box">
            <h4>Skóre: ${data.sport_event_status.home_score ?? "-"} : ${data.sport_event_status.away_score ?? "-"}</h4>
            <p><b>Po tretinách:</b> ${periods}</p>
            <div class="teams-stats">
              <div class="team-column team-home">
                <h5>${homeTeam.name}</h5>
                ${formatPlayers(homeTeam)}
              </div>
              <div class="team-column team-away">
                <h5>${awayTeam.name}</h5>
                ${formatPlayers(awayTeam)}
              </div>
            </div>
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

    // klik na riadok tímu -> načítanie štatistík
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

  sortedPlayers.forEach(([player, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${player}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

/** ============================================================
 *  MANTINGAL – simulácia sezóny + DENNÍK  (pôvodná logika ZACHOVANÁ)
 *  – prejde všetky odohrané dni chronologicky,
 *  – pred dňom zoberie TOP3 podľa „dovtedajších“ ratingov,
 *  – ak TOP3 hráč v ten deň hrá:
 *      * gól => výhra (stake × 2.5), reset na 1 €
 *      * bez gólu => prehra, stake ×2
 *  – počas simulácie plní denník (log) pre každého hráča
 *  ============================================================ */
function displayMantingal() {
  // vyber len ukončené zápasy s hráčskymi štatistikami
  const completed = (allMatches || [])
    .filter(m => m.sport_event_status && (m.sport_event_status.status === "closed" || m.sport_event_status.status === "ap"))
    .filter(m => m.statistics && m.statistics.totals && Array.isArray(m.statistics.totals.competitors))
    .slice();

  // zoradiť podľa času (od najstarších)
  completed.sort((a, b) =>
    new Date(a.sport_event.start_time) - new Date(b.sport_event.start_time)
  );

  // zoskupiť podľa dňa (YYYY-MM-DD)
  const byDay = {};
  for (const m of completed) {
    const d = new Date(m.sport_event.start_time).toISOString().slice(0, 10);
    (byDay[d] ||= []).push(m);
  }
  const days = Object.keys(byDay).sort();

  // priebežné ratingy (iba na určenie TOP3 „pred dňom“)
  const ratingSoFar = {};
  const initRating = (name) => {
    if (ratingSoFar[name] == null) ratingSoFar[name] = 1500;
  };

  // stav mantingalu pre všetkých hráčov, ktorí sa niekedy ocitli v TOP3
  // log: [{date, stake_before, goals, result, win_amount, new_stake}]
  const state = {};
  const ensureState = (name) => {
    if (!state[name]) {
      state[name] = { stake: BASE_STAKE, totalStakes: 0, totalWins: 0, lastResult: "—", log: [] };
    }
    return state[name];
  };

  // simulácia po dňoch
  for (const day of days) {
    // TOP3 podľa ratingSoFar (pred spracovaním tohto dňa)
    const top3 = Object.entries(ratingSoFar)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    if (top3.length) {
      // pre každý hráč z TOP3: ak v tento deň hrá, vyhodnotíme stávku
      for (const playerName of top3) {
        let played = false;
        let goalsThatDay = 0;

        for (const match of byDay[day]) {
          for (const team of match.statistics.totals.competitors) {
            const p = (team.players || []).find(pl => pl.name === playerName);
            if (p) {
              played = true;
              goalsThatDay += (p.statistics.goals || 0);
            }
          }
        }

        if (played) {
          const s = ensureState(playerName);
          const stakeBefore = s.stake;

          // vsádzame vždy „aktuálny stake“ platný pred týmto dňom
          s.totalStakes += stakeBefore;

          if (goalsThatDay > 0) {
            // výhra
            const winAmount = stakeBefore * ODDS;
            s.totalWins += winAmount;
            s.stake = BASE_STAKE;
            s.lastResult = "✅ výhra";

            s.log.push({
              date: day,
              stake_before: stakeBefore,
              goals: goalsThatDay,
              result: "výhra",
              win_amount: Number(winAmount.toFixed(2)),
              new_stake: s.stake
            });
          } else {
            // prehra
            const newStake = stakeBefore * 2;
            s.stake = newStake;
            s.lastResult = "❌ prehra";

            s.log.push({
              date: day,
              stake_before: stakeBefore,
              goals: 0,
              result: "prehra",
              win_amount: 0,
              new_stake: newStake
            });
          }
        }
      }
    }

    // po vyhodnotení dňa aktualizujeme priebežné ratingy podľa výkonov v tento deň
    for (const match of byDay[day]) {
      for (const team of match.statistics.totals.competitors) {
        for (const p of (team.players || [])) {
          initRating(p.name);
          ratingSoFar[p.name] += (p.statistics.goals || 0) * 20 + (p.statistics.assists || 0) * 10;
        }
      }
    }
  }

  // aktuálna TOP3 podľa „globálneho“ playerRatings (čo zobrazujeme v tabuľke)
  const currentTop3 = Object.entries(playerRatings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // celkové sumáre naprieč všetkými hráčmi, ktorí boli niekedy v TOP3
  const totals = Object.values(state).reduce(
    (acc, s) => {
      acc.stakes += s.totalStakes || 0;
      acc.wins += s.totalWins || 0;
      return acc;
    },
    { stakes: 0, wins: 0 }
  );
  const profit = totals.wins - totals.stakes;

  // ---------- RENDER DO SPRÁVNEHO KONTJ. (PC vs mobil) ----------
  const pcWrapper = document.querySelector("#players-section"); // pravý stĺpec
  const mobileWrapper = document.getElementById("mantingal-container"); // samostatná mobil sekcia

  // Vymaž staré rendery na oboch miestach
  if (pcWrapper) {
    const oldPc = pcWrapper.querySelector("#mantingal-wrapper-pc");
    if (oldPc) oldPc.remove();
  }
  if (mobileWrapper) {
    mobileWrapper.innerHTML = "";
  }

  // Helper: vytvorí DOM uzol mantingalu (tabuľka + sumár)
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
        ${currentTop3.map(([name]) => {
          const s = state[name] || { stake: BASE_STAKE, lastResult: "—", log: [] };
          const logId = `log-${slug(name)}-${context}`;
          const logHtml = (s.log.length
            ? s.log.map(e => `
                <div>
                  <b>${e.date}</b> – stake: ${e.stake_before} €,
                  góly: ${e.goals},
                  výsledok: ${e.result},
                  výhra: ${typeof e.win_amount === "number" ? e.win_amount.toFixed(2) : e.win_amount} €,
                  nový stake: ${e.new_stake} €
                </div>
              `).join("")
            : "<div>Denník je prázdny</div>"
          );

          return `
            <tr>
              <td>${name}</td>
              <td>${ODDS}</td>
              <td>${s.stake} €</td>
              <td>${s.lastResult}</td>
              <td><button class="btn-log" data-target="${logId}">📜</button></td>
            </tr>
            <tr id="${logId}" style="display:none;">
              <td colspan="5" style="text-align:left;">
                ${logHtml}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;

    const summary = document.createElement("div");
    summary.id = context === "pc" ? "mantingal-summary-pc" : "mantingal-summary-mobile";
    summary.innerHTML = `
      <p><b>Celkové stávky</b>: ${totals.stakes.toFixed(2)} €</p>
      <p><b>Výhry</b>: ${totals.wins.toFixed(2)} €</p>
      <p><b>Profit</b>: ${profit.toFixed(2)} €</p>
    `;

    container.appendChild(table);
    container.appendChild(summary);

    // toggle denníka (otvoriť/zavrieť)
    table.querySelectorAll(".btn-log").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.getAttribute("data-target"));
        if (target) target.style.display = (target.style.display === "none" ? "" : "none");
      });
    });

    return container;
  };

  if (isMobile()) {
    // render len do mobilnej sekcie (a uistiť sa, že sekcia je viditeľná len ak je v menu vybraná)
    if (mobileWrapper) {
      mobileWrapper.appendChild(buildMantingalNode("mobile"));
    }
  } else {
    // render do PC – pod tabuľku hráčov (pravý stĺpec)
    if (pcWrapper) {
      const pcNode = buildMantingalNode("pc");
      // umiestniť pod tabuľku hráčov
      pcWrapper.appendChild(pcNode);
    }
  }
}

// ========================= START =========================
window.addEventListener("DOMContentLoaded", () => {
  setupMobileSectionsOnLoad();
  fetchMatches();
});
