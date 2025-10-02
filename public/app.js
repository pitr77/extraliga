let teamRatings = {};
let playerRatings = {};
let allMatches = [];

const BASE_STAKE = 1;
const ODDS = 2.5;

// 👉 API ide teraz cez Vercel serverless funkcie (/api)
const API_BASE = "";

// načítanie zápasov
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
        displayMantingal(); // vykreslí pre PC aj mobil
    } catch (err) {
        console.error("Chyba pri načítaní zápasov:", err);
    }
}

// zobrazenie zápasov
function displayMatches(matches) {
    const tableBody = document.querySelector("#matches tbody");
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

        // klik na detail
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

// rating tímov
function displayTeamRatings() {
    const tableBody = document.querySelector("#teamRatings tbody");
    tableBody.innerHTML = "";

    const sortedTeams = Object.entries(teamRatings).sort((a, b) => b[1] - a[1]);

    sortedTeams.forEach(([team, rating]) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${team}</td><td>${rating}</td>`;
        tableBody.appendChild(row);
    });
}

// TOP 20 hráčov
function displayPlayerRatings() {
    const tableBody = document.querySelector("#playerRatings tbody");
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

/** =========================
 *  MANTINGAL – simulácia sezóny + DENNÍK
 *  =========================
 */
function displayMantingal() {
    const pcContainer = document.getElementById("mantingal-container-pc"); // pod hráčmi v PC
    const mobileContainer = document.getElementById("mantingal-container"); // samostatná sekcia v mobile

    [pcContainer, mobileContainer].forEach(container => {
        if (!container) return;
        container.innerHTML = "";

        // --- tu ide tvoja pôvodná logika simulácie (zachovaná) ---
        const state = {};
        const ensureState = (name) => {
            if (!state[name]) {
                state[name] = { stake: BASE_STAKE, totalStakes: 0, totalWins: 0, lastResult: "—", log: [] };
            }
            return state[name];
        };

        const currentTop3 = Object.entries(playerRatings)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const table = document.createElement("table");
        table.id = "mantingal";
        table.innerHTML = `
            <thead>
                <tr><th colspan="5">Mantingal – TOP 3 (kurz ${ODDS})</th></tr>
                <tr><th>Hráč</th><th>Kurz</th><th>Vklad</th><th>Posledný výsledok</th><th>Denník</th></tr>
            </thead>
            <tbody>
                ${currentTop3.map(([name], idx) => {
                    const s = ensureState(name);
                    const logId = `log-${idx}-${container.id}`;
                    const logHtml = (s.log.length
                        ? s.log.map(e => `
                            <div>
                                <b>${e.date}</b> – stake: ${e.stake_before} €,
                                góly: ${e.goals},
                                výsledok: ${e.result},
                                výhra: ${e.win_amount} €,
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
                            <td colspan="5">${logHtml}</td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        `;

        container.appendChild(table);

        // ✅ toggle denníka
        table.querySelectorAll(".btn-log").forEach(btn => {
            btn.addEventListener("click", () => {
                const target = document.getElementById(btn.getAttribute("data-target"));
                if (target) {
                    target.style.display = target.style.display === "none" ? "" : "none";
                }
            });
        });
    });
}

window.addEventListener("DOMContentLoaded", fetchMatches);
