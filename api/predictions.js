// zaciatok kodu
// /api/predictions.js
export default async function handler(req, res) {
  try {
    const url = "https://api-web.nhle.com/v1/partner-game/CZ/now";
    const resp = await fetch(url, { cache: "no-store" }); // ⬅️ zamedzí použitiu cache
    if (!resp.ok) throw new Error(`NHL odds fetch failed: ${resp.status}`);

    const data = await resp.json();

    const games = (data.games || []).map(g => {
      const getOdds = (team) => {
        const ml = team.odds?.find(o => o.description === "MONEY_LINE_2_WAY");
        return ml ? ml.value.toFixed(2) : null;
      };

      return {
        id: g.gameId,
        startTime: g.startTimeUTC,
        homeTeam: g.homeTeam?.name?.default,
        awayTeam: g.awayTeam?.name?.default,
        homeLogo: g.homeTeam?.logo,
        awayLogo: g.awayTeam?.logo,
        homeOdds: getOdds(g.homeTeam),
        awayOdds: getOdds(g.awayTeam),
      };
    });

    res.status(200).json({ games });
  } catch (err) {
    console.error("❌ Chyba pri fetchnutí predikcií:", err);
    res.status(500).json({ error: err.message });
  }
}
