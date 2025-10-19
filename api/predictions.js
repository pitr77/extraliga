// /api/predictions.js
export default async function handler(req, res) {
  try {
    const url = "https://api-web.nhle.com/v1/partner-game/CZ/now";
    const resp = await fetch(url);

    if (!resp.ok) throw new Error(`NHL odds fetch failed: ${resp.status}`);

    const data = await resp.json();

    // vyberieme len relevantné info o kurzoch
    const games = (data.games || []).map(g => ({
      id: g.id,
      startTime: g.startTimeUTC,
      homeTeam: g.homeTeam?.name?.default,
      awayTeam: g.awayTeam?.name?.default,
      bookmakers: g.partnerLines?.map(line => ({
        provider: line.providerName,
        homeOdds: line.home?.toFixed?.(2) ?? line.home,
        awayOdds: line.away?.toFixed?.(2) ?? line.away,
      })) || [],
    }));

    res.status(200).json({ games });
  } catch (err) {
    console.error("❌ Chyba pri fetchnutí predikcií:", err);
    res.status(500).json({ error: err.message });
  }
}
