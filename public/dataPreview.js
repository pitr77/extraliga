import { useEffect, useState } from "react";

export default function DataPreview() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://api-web.nhle.com/v1/teams")
      .then((res) => res.json())
      .then((data) => {
        setTeams(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Chyba pri načítaní tímov:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🧊 Náhľad NHL tímov</h1>

      {loading ? (
        <p>Načítavam dáta z NHL API...</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2">ID</th>
              <th className="border px-4 py-2">Názov tímu</th>
              <th className="border px-4 py-2">Skratka</th>
            </tr>
          </thead>
          <tbody>
            {teams.slice(0, 5).map((team) => (
              <tr key={team.id}>
                <td className="border px-4 py-2">{team.id}</td>
                <td className="border px-4 py-2">{team.fullName}</td>
                <td className="border px-4 py-2">{team.abbrev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
