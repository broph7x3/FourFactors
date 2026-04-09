import { useState, useEffect, useCallback, useMemo } from "react";

// ─── Constants & Helpers ─────────────────────────────────────────────
const STORAGE_KEY = "bb-four-factors-games-v2";

const FOUR_FACTORS_INFO = {
  efg: { name: "eFG%", weight: "40%", desc: "Effective Field Goal %", formula: "(FGM + 0.5 × 3PM) / FGA" },
  tov: { name: "TOV%", weight: "25%", desc: "Turnover Rate", formula: "TOV / (FGA + 0.44 × FTA + TOV)" },
  orb: { name: "ORB%", weight: "20%", desc: "Offensive Rebound %", formula: "ORB / (ORB + Opp DRB)" },
  ftf: { name: "FT Factor", weight: "15%", desc: "Free Throw Rate", formula: "FTM / FGA" },
};

const emptyPlayer = () => ({
  id: Date.now() + Math.random(),
  name: "", min: "", pts: "", fgm: "", fga: "", tpm: "", tpa: "",
  ftm: "", fta: "", orb: "", drb: "", ast: "", stl: "", blk: "", tov: "", pf: "",
});

const emptyTeamLine = () => ({
  fgm: "", fga: "", tpm: "", tpa: "", ftm: "", fta: "",
  orb: "", drb: "", ast: "", stl: "", blk: "", tov: "", pf: "", pts: "",
});

const n = (v) => parseFloat(v) || 0;

const calcFourFactors = (stats) => {
  const fga = n(stats.fga), fgm = n(stats.fgm), tpm = n(stats.tpm);
  const fta = n(stats.fta), ftm = n(stats.ftm);
  const orb = n(stats.orb), tov = n(stats.tov);
  const oppDrb = n(stats.oppDrb);
  const efg = fga > 0 ? ((fgm + 0.5 * tpm) / fga) * 100 : 0;
  const tovPct = (fga + 0.44 * fta + tov) > 0 ? (tov / (fga + 0.44 * fta + tov)) * 100 : 0;
  const orbPct = (orb + oppDrb) > 0 ? (orb / (orb + oppDrb)) * 100 : 0;
  const ftFactor = fga > 0 ? (ftm / fga) * 100 : 0;
  return { efg, tovPct, orbPct, ftFactor };
};

const aggregatePlayerStats = (players) => {
  const totals = { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0 };
  players.forEach((p) => {
    Object.keys(totals).forEach((k) => { totals[k] += n(p[k]); });
  });
  return totals;
};

const fmt = (v) => v.toFixed(1);
const fmtPct = (v) => v.toFixed(1) + "%";

// ─── Linear regression helper ────────────────────────────────────────
const linearRegression = (values) => {
  const nn = values.length;
  if (nn < 2) return { slope: 0, intercept: values[0] || 0, predict: () => values[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < nn; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const slope = (nn * sumXY - sumX * sumY) / (nn * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / nn;
  return { slope, intercept, predict: (x) => intercept + slope * x };
};

// ─── Chart Component with trend line ─────────────────────────────────
const TrendChart = ({ data, label, color, height = 110, benchmark }) => {
  if (!data || data.length === 0) return null;
  const values = data.map(d => d.value);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values, benchmark != null ? benchmark : Infinity);
  const max = Math.max(...values, benchmark != null ? benchmark : -Infinity);
  const range = max - min || 1;
  const pad = range * 0.15;
  const yMin = min - pad;
  const yMax = max + pad;
  const yRange = yMax - yMin || 1;

  const chartW = 260;
  const chartH = height - 30;
  const barArea = chartW - 30;
  const barW = Math.min(24, Math.floor(barArea / data.length) - 4);
  const gap = (barArea - barW * data.length) / Math.max(data.length - 1, 1);

  const reg = linearRegression(values);
  const trendUp = reg.slope > 0;

  const xForBar = (i) => 15 + i * (barW + gap) + barW / 2;
  const yForVal = (v) => chartH - ((v - yMin) / yRange) * (chartH - 8) - 4;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          Avg: <span style={{ fontWeight: 700, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(avg)}</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${chartW} ${height}`} style={{ display: "block" }}>
        {/* Benchmark line */}
        {benchmark != null && (
          <>
            <line x1="12" y1={yForVal(benchmark)} x2={chartW - 4} y2={yForVal(benchmark)}
              stroke="var(--muted)" strokeWidth="0.7" strokeDasharray="3,3" opacity="0.5" />
            <text x={chartW - 2} y={yForVal(benchmark) - 3} fill="var(--muted)" fontSize="7" textAnchor="end" fontFamily="'JetBrains Mono', monospace">{fmt(benchmark)}</text>
          </>
        )}
        {/* Bars */}
        {data.map((d, i) => {
          const bx = 15 + i * (barW + gap);
          const by = yForVal(d.value);
          const bh = chartH - 4 - by;
          return (
            <g key={i}>
              <rect x={bx} y={by} width={barW} height={Math.max(2, bh)} rx="2"
                fill={color} opacity={0.25 + 0.65 * (i / Math.max(data.length - 1, 1))} />
              <text x={bx + barW / 2} y={by - 3} fill="var(--muted)" fontSize="7" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace">{fmt(d.value)}</text>
              <text x={bx + barW / 2} y={height - 2} fill="var(--muted)" fontSize="7" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        {/* Trend line */}
        {data.length >= 2 && (
          <line
            x1={xForBar(0)} y1={yForVal(reg.predict(0))}
            x2={xForBar(data.length - 1)} y2={yForVal(reg.predict(data.length - 1))}
            stroke={color} strokeWidth="2" strokeLinecap="round"
            opacity="0.9" strokeDasharray="6,3"
          />
        )}
        {/* Trend arrow indicator */}
        {data.length >= 2 && (
          <text x={chartW - 4} y={yForVal(reg.predict(data.length - 1)) + 1}
            fill={color} fontSize="11" textAnchor="end" fontWeight="700" opacity="0.9">
            {Math.abs(reg.slope) < 0.3 ? "→" : trendUp ? "↗" : "↘"}
          </text>
        )}
      </svg>
    </div>
  );
};

// ─── Four Factor Gauge ───────────────────────────────────────────────
const FactorGauge = ({ label, value, benchmark, desc, inverse }) => {
  const isGood = inverse ? value < benchmark : value > benchmark;
  const pct = Math.min(100, Math.max(0, (value / (benchmark * 2)) * 100));
  return (
    <div style={{
      background: "var(--card-bg)", borderRadius: 10, padding: "14px 16px",
      border: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: isGood ? "var(--green)" : "var(--red)" }}>{fmtPct(value)}</span>
      </div>
      <div style={{ height: 6, background: "var(--track)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, transition: "width 0.5s ease",
          width: `${pct}%`,
          background: isGood ? "var(--green)" : "var(--red)",
        }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{desc} — league avg ≈ {fmt(benchmark)}%</div>
    </div>
  );
};

// ─── Tab Button ──────────────────────────────────────────────────────
const Tab = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: "8px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
    border: "none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    background: "none", color: active ? "var(--text)" : "var(--muted)",
    cursor: "pointer", transition: "all 0.2s",
  }}>{children}</button>
);

// ─── Inline Input ────────────────────────────────────────────────────
const Cell = ({ value, onChange, width = 42 }) => (
  <input
    type="text" inputMode="numeric" value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width, padding: "4px 2px", textAlign: "center", fontSize: 12,
      background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 4,
      color: "var(--text)", fontFamily: "'JetBrains Mono', monospace",
    }}
  />
);

// ─── Box Score Input Table ───────────────────────────────────────────
const statCols = [
  { key: "name", label: "Player", w: 110, type: "text" },
  { key: "min", label: "MIN", w: 40 }, { key: "pts", label: "PTS", w: 40 },
  { key: "fgm", label: "FGM", w: 40 }, { key: "fga", label: "FGA", w: 40 },
  { key: "tpm", label: "3PM", w: 40 }, { key: "tpa", label: "3PA", w: 40 },
  { key: "ftm", label: "FTM", w: 40 }, { key: "fta", label: "FTA", w: 40 },
  { key: "orb", label: "ORB", w: 40 }, { key: "drb", label: "DRB", w: 40 },
  { key: "ast", label: "AST", w: 40 }, { key: "stl", label: "STL", w: 40 },
  { key: "blk", label: "BLK", w: 40 }, { key: "tov", label: "TOV", w: 40 },
  { key: "pf", label: "PF", w: 40 },
];

const BoxScoreTable = ({ players, setPlayers }) => {
  const updatePlayer = (idx, key, val) => {
    const updated = [...players];
    updated[idx] = { ...updated[idx], [key]: val };
    setPlayers(updated);
  };
  const addPlayer = () => setPlayers([...players, emptyPlayer()]);
  const removePlayer = (idx) => setPlayers(players.filter((_, i) => i !== idx));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 750 }}>
        <thead>
          <tr>
            {statCols.map((c) => (
              <th key={c.key} style={{
                padding: "6px 3px", fontSize: 10, fontWeight: 700, color: "var(--muted)",
                textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)",
                textAlign: "center", whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
            <th style={{ width: 30, borderBottom: "1px solid var(--border)" }} />
          </tr>
        </thead>
        <tbody>
          {players.map((p, idx) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
              {statCols.map((c) => (
                <td key={c.key} style={{ padding: "3px 2px", textAlign: "center" }}>
                  {c.key === "name" ? (
                    <input type="text" value={p.name} placeholder="Name"
                      onChange={(e) => updatePlayer(idx, "name", e.target.value)}
                      style={{
                        width: c.w, padding: "4px 6px", fontSize: 12, fontWeight: 600,
                        background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 4,
                        color: "var(--text)",
                      }} />
                  ) : (
                    <Cell value={p[c.key]} onChange={(v) => updatePlayer(idx, c.key, v)} width={c.w} />
                  )}
                </td>
              ))}
              <td style={{ padding: "3px" }}>
                <button onClick={() => removePlayer(idx)} style={{
                  background: "none", border: "none", color: "var(--red)", cursor: "pointer",
                  fontSize: 16, lineHeight: 1, padding: "2px 4px",
                }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addPlayer} style={{
        marginTop: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
        background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
        cursor: "pointer",
      }}>+ Add Player</button>
    </div>
  );
};

// ─── Column alias map ────────────────────────────────────────────────
const COLUMN_ALIASES = {
  PLAYER: "name", NAME: "name",
  MIN: "min", MP: "min",
  PTS: "pts", POINTS: "pts",
  FGM: "fgm", FG: "fgm", "FG MADE": "fgm",
  FGA: "fga", "FG ATT": "fga",
  "3PM": "tpm", "3P": "tpm", "3PT": "tpm", "3FGM": "tpm", TPM: "tpm",
  "3PA": "tpa", "3PTA": "tpa", "3FGA": "tpa", TPA: "tpa",
  FTM: "ftm", FT: "ftm", "FT MADE": "ftm",
  FTA: "fta", "FT ATT": "fta",
  OREB: "orb", ORB: "orb", OR: "orb",
  DREB: "drb", DRB: "drb", DR: "drb",
  AST: "ast", ASST: "ast", ASSISTS: "ast",
  STL: "stl", STEALS: "stl",
  BLK: "blk", BLOCKS: "blk",
  TO: "tov", TOV: "tov", TURNOVERS: "tov",
  PF: "pf", FOUL: "pf", FOULS: "pf",
  "+/-": "_skip_", "FG%": "_skip_", "3PT%": "_skip_", "FT%": "_skip_",
};

// ─── Parse a row into a stats object ─────────────────────────────────
const parseRow = (cells, headerMap) => {
  const p = emptyPlayer();
  let hasName = false;
  cells.forEach((cell, ci) => {
    const key = headerMap[ci];
    if (!key || key === "_skip_") return;
    let val = cell.textContent.trim();
    if (val === "-" || val === "") return;
    if (key === "name") {
      p.name = val.replace(/^#\d+\s+/, "");
      hasName = true;
    } else {
      if (val.includes("-") && (key === "fgm" || key === "ftm" || key === "tpm")) {
        const parts = val.split("-");
        p[key] = parts[0];
        const attemptKey = key === "fgm" ? "fga" : key === "ftm" ? "fta" : "tpa";
        p[attemptKey] = parts[1];
      } else {
        p[key] = val;
      }
    }
  });
  return { player: p, hasName };
};

// ─── Full HTML Box Score Parser ──────────────────────────────────────
const parseFullHTMLBoxScore = (html) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let gameDate = "";
    let teamName = "";
    let opponentName = "";

    const title = doc.querySelector("title");
    if (title) {
      const titleText = title.textContent.trim();
      const atMatch = titleText.match(/^(.+?)\s+(\d+)\s+at\s+(.+?)\s+(\d+)$/i);
      if (atMatch) {
        teamName = atMatch[1].trim();
        opponentName = atMatch[3].trim();
      }
    }

    const dateEl = doc.querySelector("#game-date .detail, #game-date");
    if (dateEl) {
      const rawDate = dateEl.textContent.trim();
      const months = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
                       Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
      const dm = rawDate.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
      if (dm) gameDate = `${dm[3]}-${months[dm[2]] || "01"}-${dm[1].padStart(2, "0")}`;
    }

    const tables = doc.querySelectorAll("table");
    if (tables.length === 0) return null;

    let bestTable = tables[0];
    let bestRows = 0;
    tables.forEach((t) => {
      const rows = t.querySelectorAll("tr").length;
      if (rows > bestRows) { bestRows = rows; bestTable = t; }
    });

    const rows = bestTable.querySelectorAll("tr");
    const headerRow = rows[0];
    if (!headerRow) return null;

    const headers = [];
    headerRow.querySelectorAll("th, td").forEach((cell) => {
      headers.push(cell.textContent.trim().toUpperCase());
    });

    const headerMap = {};
    let hasNameCol = false;
    headers.forEach((h, i) => {
      if (COLUMN_ALIASES[h]) {
        headerMap[i] = COLUMN_ALIASES[h];
        if (COLUMN_ALIASES[h] === "name") hasNameCol = true;
      } else {
        for (const [alias, key] of Object.entries(COLUMN_ALIASES)) {
          if (h === alias || (h.length > 1 && h.includes(alias) && alias.length > 1)) {
            headerMap[i] = key;
            if (key === "name") hasNameCol = true;
            break;
          }
        }
      }
    });
    if (!hasNameCol && (headers[0] === "" || headers[0] === "\u00A0" || !headerMap[0])) {
      headerMap[0] = "name";
    }

    const allRows = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll("td, th");
      const { player, hasName } = parseRow(cells, headerMap);
      if (hasName && player.name) allRows.push(player);
    }

    const players = [];
    let myTeamTotalRow = null;
    let oppTeamTotalRow = null;

    for (const row of allRows) {
      const nameUp = row.name.toUpperCase();
      const isTeamRow = nameUp.includes("TOTAL") || nameUp.includes("TEAM") ||
        (teamName && nameUp === teamName.toUpperCase()) ||
        (opponentName && nameUp === opponentName.toUpperCase());

      if (isTeamRow) {
        if (teamName && nameUp === teamName.toUpperCase()) myTeamTotalRow = row;
        else if (opponentName && nameUp === opponentName.toUpperCase()) oppTeamTotalRow = row;
        else if (!myTeamTotalRow) myTeamTotalRow = row;
        else oppTeamTotalRow = row;
      } else if (!row.name.match(/^(DNP|DND)/i)) {
        const hasStats = n(row.fga) > 0 || n(row.fta) > 0 || n(row.min) > 0 || n(row.pts) > 0;
        if (hasStats) players.push(row);
      }
    }

    const oppLine = emptyTeamLine();
    if (oppTeamTotalRow) {
      for (const k of Object.keys(oppLine)) {
        if (oppTeamTotalRow[k] !== undefined && oppTeamTotalRow[k] !== "") oppLine[k] = oppTeamTotalRow[k];
      }
    }

    return {
      players: players.length > 0 ? players : null,
      oppLine,
      teamName: teamName || "",
      opponentName: opponentName || "",
      gameDate: gameDate || "",
    };
  } catch (e) {
    console.error("Parse error:", e);
    return null;
  }
};

// ─── Main App ────────────────────────────────────────────────────────
export default function FourFactorsDashboard() {
  const [games, setGames] = useState([]);
  const [view, setView] = useState("input");
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState("__team__");
  const [loading, setLoading] = useState(true);
  const [editingGameId, setEditingGameId] = useState(null); // null = new game, id = editing

  const [gameDate, setGameDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [oppLine, setOppLine] = useState(emptyTeamLine());
  const [pasteHTML, setPasteHTML] = useState("");
  const [parseMsg, setParseMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) setGames(JSON.parse(result.value));
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const saveGames = useCallback(async (updated) => {
    setGames(updated);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(updated)); } catch (e) { console.error(e); }
  }, []);

  const handleParse = () => {
    const result = parseFullHTMLBoxScore(pasteHTML);
    if (result && result.players) {
      setPlayers(result.players);
      if (result.opponentName) setOpponent(result.opponentName);
      if (result.teamName) setTeamName(result.teamName);
      if (result.gameDate) setGameDate(result.gameDate);
      if (result.oppLine) setOppLine(result.oppLine);
      const parts = [`${result.players.length} players`];
      if (result.opponentName) parts.push(`vs ${result.opponentName}`);
      if (result.gameDate) parts.push(`on ${result.gameDate}`);
      if (result.oppLine && n(result.oppLine.pts) > 0) parts.push("(opponent stats included)");
      setParseMsg(`Parsed ${parts.join(", ")}.`);
      setPasteHTML("");
    } else {
      setParseMsg("Could not parse box score. Check your HTML table format.");
    }
  };

  const resetForm = () => {
    setPlayers([emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()]);
    setOppLine(emptyTeamLine());
    setOpponent(""); setGameDate(""); setTeamName("");
    setEditingGameId(null);
    setParseMsg("");
  };

  const handleSaveGame = () => {
    if (!opponent) { alert("Enter opponent name"); return; }
    const activePlayers = players.filter(p => p.name);
    const teamStats = aggregatePlayerStats(activePlayers);

    if (editingGameId) {
      // Update existing game
      const updated = games.map(g => {
        if (g.id !== editingGameId) return g;
        return {
          ...g,
          date: gameDate || new Date().toISOString().split("T")[0],
          opponent,
          teamName: teamName || "Our Team",
          players: activePlayers,
          teamStats,
          oppLine: { ...oppLine },
        };
      });
      saveGames(updated);
      setSelectedGame(editingGameId);
      setParseMsg("Game updated!");
    } else {
      // Create new game
      const game = {
        id: Date.now(),
        date: gameDate || new Date().toISOString().split("T")[0],
        opponent,
        teamName: teamName || "Our Team",
        players: activePlayers,
        teamStats,
        oppLine: { ...oppLine },
      };
      const updated = [...games, game];
      saveGames(updated);
      setSelectedGame(game.id);
      setParseMsg("Game saved!");
    }
    resetForm();
    setView("game");
  };

  const handleDeleteGame = (id) => {
    if (!confirm("Delete this game?")) return;
    saveGames(games.filter((g) => g.id !== id));
    if (selectedGame === id) setSelectedGame(null);
    if (editingGameId === id) resetForm();
  };

  const handleEditGame = (id) => {
    const game = games.find(g => g.id === id);
    if (!game) return;
    setEditingGameId(id);
    setGameDate(game.date || "");
    setOpponent(game.opponent || "");
    setTeamName(game.teamName || "");
    setPlayers(game.players.length > 0 ? game.players.map(p => ({ ...p, id: p.id || Date.now() + Math.random() })) : [emptyPlayer()]);
    setOppLine({ ...emptyTeamLine(), ...game.oppLine });
    setParseMsg("");
    setView("input");
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const getGameFactors = (game) => {
    const ts = game.teamStats;
    const opp = game.oppLine;
    const teamFF = calcFourFactors({ ...ts, oppDrb: n(opp.drb) });
    const oppFF = calcFourFactors({ ...opp, oppDrb: ts.drb });
    return { team: teamFF, opp: oppFF };
  };

  // Sort games by date ascending (oldest first)
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [games]);

  const allPlayerNames = useMemo(() => {
    const names = new Set();
    games.forEach((g) => g.players.forEach((p) => { if (p.name) names.add(p.name); }));
    return Array.from(names).sort();
  }, [games]);

  const currentGame = sortedGames.find((g) => g.id === selectedGame);

  const cssVars = {
    "--bg": "#0d1117", "--card-bg": "#161b22", "--input-bg": "#0d1117",
    "--border": "#30363d", "--text": "#e6edf3", "--muted": "#8b949e",
    "--accent": "#58a6ff", "--green": "#3fb950", "--red": "#f85149",
    "--orange": "#d29922", "--purple": "#bc8cff", "--track": "#21262d",
    "--header-bg": "#0e1218",
  };

  if (loading) return <div style={{ ...cssVars, background: "var(--bg)", color: "var(--text)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace" }}>Loading...</div>;

  return (
    <div style={{ ...cssVars, background: "var(--bg)", color: "var(--text)", minHeight: "100vh", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, var(--accent), var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏀</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>FOUR FACTORS</div>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Basketball Analytics Dashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          <Tab active={view === "input"} onClick={() => setView("input")}>+ New Game</Tab>
          <Tab active={view === "game"} onClick={() => setView("game")}>Game View</Tab>
          <Tab active={view === "trends"} onClick={() => setView("trends")}>Trends</Tab>
          <Tab active={view === "dev"} onClick={() => setView("dev")}>Development</Tab>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* ═══ INPUT VIEW ═══ */}
        {view === "input" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              {editingGameId ? "Edit Game" : "Enter Box Score"}
              {editingGameId && (
                <button onClick={handleCancelEdit} style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", cursor: "pointer" }}>Cancel Edit</button>
              )}
            </h2>

            <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Paste HTML Box Score</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Paste full HTML source — auto-extracts date, teams, player stats &amp; opponent totals</div>
              <textarea value={pasteHTML} onChange={(e) => setPasteHTML(e.target.value)}
                placeholder="Paste HTML here to auto-populate everything..."
                style={{ width: "100%", height: 80, padding: 10, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <button onClick={handleParse} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--purple)", color: "#fff", border: "none", borderRadius: 6 }}>Parse HTML</button>
                {parseMsg && <span style={{ fontSize: 12, color: parseMsg.startsWith("Could") ? "var(--red)" : "var(--green)" }}>{parseMsg}</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "Your Team", val: teamName, set: setTeamName, ph: "Our Team" },
                { label: "Opponent", val: opponent, set: setOpponent, ph: "Opponent" },
                { label: "Date", val: gameDate, set: setGameDate, ph: "YYYY-MM-DD" },
              ].map((f) => (
                <div key={f.label} style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.label}</div>
                  <input type="text" value={f.val} onChange={(e) => f.set(e.target.value)} placeholder={f.ph}
                    style={{ width: "100%", padding: "8px 10px", fontSize: 13, boxSizing: "border-box", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
                </div>
              ))}
            </div>

            <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Your Team — Player Stats</div>
              <BoxScoreTable players={players} setPlayers={setPlayers} />
            </div>

            <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Opponent Team Totals</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["pts","fgm","fga","tpm","tpa","ftm","fta","orb","drb","ast","stl","blk","tov","pf"].map((k) => (
                  <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                    <Cell value={oppLine[k]} onChange={(v) => setOppLine({ ...oppLine, [k]: v })} width={46} />
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSaveGame} style={{ padding: "10px 28px", fontSize: 14, fontWeight: 700, background: "linear-gradient(135deg, var(--accent), var(--purple))", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>{editingGameId ? "Update Game" : "Save Game"}</button>
          </div>
        )}

        {/* ═══ GAME VIEW ═══ */}
        {view === "game" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Game Analysis</h2>
            {sortedGames.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No games yet. Add one from the "+ New Game" tab.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                  {sortedGames.map((g) => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                      <button onClick={() => setSelectedGame(g.id)} style={{
                        padding: "6px 14px", fontSize: 12, fontWeight: selectedGame === g.id ? 700 : 500,
                        background: selectedGame === g.id ? "var(--accent)" : "var(--card-bg)",
                        color: selectedGame === g.id ? "#fff" : "var(--text)",
                        border: `1px solid ${selectedGame === g.id ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "6px 0 0 6px", cursor: "pointer",
                      }}>{g.date} vs {g.opponent}</button>
                      <button onClick={() => handleEditGame(g.id)} title="Edit" style={{
                        padding: "6px 8px", fontSize: 12, background: selectedGame === g.id ? "var(--accent)" : "var(--card-bg)",
                        color: selectedGame === g.id ? "#fff" : "var(--orange)", border: `1px solid ${selectedGame === g.id ? "var(--accent)" : "var(--border)"}`,
                        borderLeft: "none", cursor: "pointer", opacity: 0.85,
                      }}>✎</button>
                      <button onClick={() => handleDeleteGame(g.id)} title="Delete" style={{
                        padding: "6px 8px", fontSize: 12, background: selectedGame === g.id ? "var(--accent)" : "var(--card-bg)",
                        color: selectedGame === g.id ? "#fff" : "var(--red)", border: `1px solid ${selectedGame === g.id ? "var(--accent)" : "var(--border)"}`,
                        borderLeft: "none", borderRadius: "0 6px 6px 0", cursor: "pointer", opacity: 0.85,
                      }}>×</button>
                    </div>
                  ))}
                </div>

                {currentGame && (() => {
                  const ff = getGameFactors(currentGame);
                  const teamPts = currentGame.players.reduce((s, p) => s + n(p.pts), 0);
                  const oppPts = n(currentGame.oppLine.pts);
                  const won = teamPts > oppPts;
                  return (
                    <div>
                      {(teamPts > 0 || oppPts > 0) && (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24, marginBottom: 20, padding: "14px 20px", background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                          <div style={{ textAlign: "right", flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: won ? "var(--green)" : "var(--text)" }}>{currentGame.teamName}</div>
                          </div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 800 }}>
                            <span style={{ color: won ? "var(--green)" : "var(--text)" }}>{teamPts}</span>
                            <span style={{ color: "var(--muted)", margin: "0 8px", fontSize: 20 }}>–</span>
                            <span style={{ color: !won ? "var(--red)" : "var(--text)" }}>{oppPts}</span>
                          </div>
                          <div style={{ textAlign: "left", flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: !won ? "var(--red)" : "var(--text)" }}>{currentGame.opponent}</div>
                          </div>
                        </div>
                      )}

                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{currentGame.teamName} — Four Factors</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                          <FactorGauge label="eFG%" value={ff.team.efg} benchmark={52} desc={FOUR_FACTORS_INFO.efg.formula} />
                          <FactorGauge label="TOV%" value={ff.team.tovPct} benchmark={14} desc={FOUR_FACTORS_INFO.tov.formula} inverse />
                          <FactorGauge label="ORB%" value={ff.team.orbPct} benchmark={25} desc={FOUR_FACTORS_INFO.orb.formula} />
                          <FactorGauge label="FT Factor" value={ff.team.ftFactor} benchmark={20} desc={FOUR_FACTORS_INFO.ftf.formula} />
                        </div>
                      </div>

                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{currentGame.opponent} — Four Factors</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                          <FactorGauge label="eFG%" value={ff.opp.efg} benchmark={52} desc="Opponent efficiency" />
                          <FactorGauge label="TOV%" value={ff.opp.tovPct} benchmark={14} desc="Opponent turnovers" inverse />
                          <FactorGauge label="ORB%" value={ff.opp.orbPct} benchmark={25} desc="Opponent offensive rebounds" />
                          <FactorGauge label="FT Factor" value={ff.opp.ftFactor} benchmark={20} desc="Opponent FT rate" />
                        </div>
                      </div>

                      <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Player Four Factors</div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
                            <thead>
                              <tr>
                                {["Player","MIN","PTS","eFG%","TOV%","ORB%","FT Factor"].map((h) => (
                                  <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", textAlign: h === "Player" ? "left" : "center" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {currentGame.players.filter((p) => p.name).map((p, i) => {
                                const pff = calcFourFactors({ ...p, oppDrb: n(currentGame.oppLine.drb) / Math.max(currentGame.players.length, 1) });
                                return (
                                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>{p.name}</td>
                                    <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{p.min || "-"}</td>
                                    <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{p.pts || "0"}</td>
                                    {[pff.efg, pff.tovPct, pff.orbPct, pff.ftFactor].map((v, vi) => {
                                      const benchmarks = [52, 14, 25, 20];
                                      const inverse = [false, true, false, false];
                                      const good = inverse[vi] ? v < benchmarks[vi] : v > benchmarks[vi];
                                      return (
                                        <td key={vi} style={{ padding: "8px 10px", textAlign: "center", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: n(p.fga) > 0 ? (good ? "var(--green)" : "var(--red)") : "var(--muted)" }}>
                                          {n(p.fga) > 0 ? fmtPct(v) : "-"}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ═══ TRENDS VIEW ═══ */}
        {view === "trends" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Trends</h2>
            {sortedGames.length < 2 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                {sortedGames.length === 0 ? "Add games to see trends." : "Add at least 2 games to see trends."}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>View:</span>
                  <button onClick={() => setSelectedPlayer("__team__")} style={{
                    padding: "5px 12px", fontSize: 12, fontWeight: selectedPlayer === "__team__" ? 700 : 500,
                    background: selectedPlayer === "__team__" ? "var(--accent)" : "var(--card-bg)",
                    color: selectedPlayer === "__team__" ? "#fff" : "var(--text)",
                    border: `1px solid ${selectedPlayer === "__team__" ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 6, cursor: "pointer",
                  }}>Team</button>
                  {allPlayerNames.map((name) => (
                    <button key={name} onClick={() => setSelectedPlayer(name)} style={{
                      padding: "5px 12px", fontSize: 12, fontWeight: selectedPlayer === name ? 700 : 500,
                      background: selectedPlayer === name ? "var(--purple)" : "var(--card-bg)",
                      color: selectedPlayer === name ? "#fff" : "var(--text)",
                      border: `1px solid ${selectedPlayer === name ? "var(--purple)" : "var(--border)"}`,
                      borderRadius: 6, cursor: "pointer",
                    }}>{name}</button>
                  ))}
                </div>

                {(() => {
                  const isTeam = selectedPlayer === "__team__";
                  const trendData = sortedGames.map((g) => {
                    let stats;
                    if (isTeam) {
                      stats = { ...g.teamStats, oppDrb: n(g.oppLine.drb) };
                    } else {
                      const p = g.players.find((pl) => pl.name === selectedPlayer);
                      if (!p) return null;
                      stats = { ...p, oppDrb: n(g.oppLine.drb) / Math.max(g.players.length, 1) };
                    }
                    const ff = calcFourFactors(stats);
                    return { label: g.date.slice(5), date: g.date, opponent: g.opponent, ...ff };
                  }).filter(Boolean);

                  if (trendData.length < 2) return (
                    <div style={{ color: "var(--muted)", textAlign: "center", padding: 20 }}>
                      {isTeam ? "Need more games." : `${selectedPlayer} only appears in 1 game.`}
                    </div>
                  );

                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <TrendChart data={trendData.map((d) => ({ value: d.efg, label: d.label }))} label="eFG%" color="var(--green)" benchmark={52} />
                      </div>
                      <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <TrendChart data={trendData.map((d) => ({ value: d.tovPct, label: d.label }))} label="TOV% (lower is better)" color="var(--red)" benchmark={14} />
                      </div>
                      <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <TrendChart data={trendData.map((d) => ({ value: d.orbPct, label: d.label }))} label="ORB%" color="var(--orange)" benchmark={25} />
                      </div>
                      <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <TrendChart data={trendData.map((d) => ({ value: d.ftFactor, label: d.label }))} label="FT Factor" color="var(--accent)" benchmark={20} />
                      </div>

                      <div style={{ gridColumn: "1 / -1", background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Game-by-Game: {isTeam ? "Team" : selectedPlayer}</div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%" }}>
                            <thead>
                              <tr>
                                {["Date","Opponent","eFG%","TOV%","ORB%","FT Factor"].map((h) => (
                                  <th key={h} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", textAlign: h === "Date" || h === "Opponent" ? "left" : "center" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {trendData.map((d, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                  <td style={{ padding: "6px 10px", fontSize: 12 }}>{d.date}</td>
                                  <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>{d.opponent}</td>
                                  {[
                                    { v: d.efg, b: 52, inv: false },
                                    { v: d.tovPct, b: 14, inv: true },
                                    { v: d.orbPct, b: 25, inv: false },
                                    { v: d.ftFactor, b: 20, inv: false },
                                  ].map((f, fi) => (
                                    <td key={fi} style={{ padding: "6px 10px", textAlign: "center", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: (f.inv ? f.v < f.b : f.v > f.b) ? "var(--green)" : "var(--red)" }}>{fmtPct(f.v)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ═══ DEVELOPMENT VIEW ═══ */}
        {view === "dev" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Skill Development Focus</h2>
            {sortedGames.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Add games to generate development insights.</div>
            ) : (() => {
              // ── Analysis engine ──
              const BENCHMARKS = { efg: 52, tovPct: 14, orbPct: 25, ftFactor: 20 };
              const FACTOR_META = {
                efg:      { name: "eFG%",      higher: true, color: "var(--green)",  icon: "🎯" },
                tovPct:   { name: "TOV%",      higher: false, color: "var(--red)",   icon: "🤲" },
                orbPct:   { name: "ORB%",      higher: true, color: "var(--orange)", icon: "💪" },
                ftFactor: { name: "FT Factor", higher: true, color: "var(--accent)", icon: "🏀" },
              };

              const analyzeEntity = (factorsPerGame) => {
                if (factorsPerGame.length === 0) return null;
                const results = {};
                for (const key of Object.keys(BENCHMARKS)) {
                  const vals = factorsPerGame.map(f => f[key]);
                  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
                  const reg = linearRegression(vals);
                  const recent3 = vals.slice(-Math.min(3, vals.length));
                  const recentAvg = recent3.reduce((s, v) => s + v, 0) / recent3.length;
                  const bm = BENCHMARKS[key];
                  const meta = FACTOR_META[key];
                  const gapFromBenchmark = meta.higher ? avg - bm : bm - avg;
                  const trendDir = meta.higher ? reg.slope : -reg.slope; // positive = improving
                  const recentGap = meta.higher ? recentAvg - bm : bm - recentAvg;

                  // Priority score: lower = needs more work
                  // Combines: how far below benchmark + worsening trend
                  const priorityScore = gapFromBenchmark + trendDir * 3 + recentGap * 0.5;

                  let trendLabel, trendColor;
                  if (Math.abs(reg.slope) < 0.3) { trendLabel = "Stable"; trendColor = "var(--muted)"; }
                  else if (trendDir > 0) { trendLabel = "Improving"; trendColor = "var(--green)"; }
                  else { trendLabel = "Declining"; trendColor = "var(--red)"; }

                  let statusLabel, statusColor;
                  if (gapFromBenchmark >= 5) { statusLabel = "Strength"; statusColor = "var(--green)"; }
                  else if (gapFromBenchmark >= -3) { statusLabel = "Average"; statusColor = "var(--orange)"; }
                  else { statusLabel = "Needs Work"; statusColor = "var(--red)"; }

                  results[key] = { avg, recentAvg, slope: reg.slope, trendDir, trendLabel, trendColor, statusLabel, statusColor, priorityScore, gapFromBenchmark };
                }
                // Sort by priority (lowest = most important to develop)
                const sorted = Object.entries(results).sort((a, b) => a[1].priorityScore - b[1].priorityScore);
                return { factors: results, prioritized: sorted };
              };

              const getDrills = (key, status) => {
                const drills = {
                  efg: {
                    "Needs Work": ["Catch-and-shoot spot-up reps from game locations", "Lay-up finishing drills (both hands, off glass, reverse)", "Shot-fake one-dribble pull-up progression", "Screen-usage cutting drills to create open looks"],
                    "Average": ["Mid-range pull-up game from screens", "Three-point shooting off movement", "Floater / runner practice in the lane"],
                    "Strength": ["Maintain rhythm with game-speed shooting drills", "Add step-back and fadeaway to shot repertoire"],
                  },
                  tovPct: {
                    "Needs Work": ["Ball-handling under pressure — full-court 1v1 dribble drills", "Decision-making scrimmages with turnover counts", "Passing accuracy drills (bounce, chest, skip)", "Dribble retreat / protect drills vs traps"],
                    "Average": ["Vision training — read-and-react passing drills", "Half-court decision games (limit dribbles per possession)", "Weak hand handling in traffic"],
                    "Strength": ["Maintain composure — late-game pressure simulations", "Advanced passing: behind-the-back, skip, lob timing"],
                  },
                  orbPct: {
                    "Needs Work": ["Box-out and crash drill (5v5 shell rebounding)", "Tip-in and putback repetitions", "Read-the-shot anticipation drills", "Positioning: swim-move and seal-off technique"],
                    "Average": ["Outlet-to-crash transitions (rebounder to scorer)", "Long rebound positioning off three-point shots", "Second-effort mentality drills (3 tips before score)"],
                    "Strength": ["Maintain motor — conditioning with rebounding circuits", "Offensive rebound to kick-out passing"],
                  },
                  ftFactor: {
                    "Needs Work": ["Free-throw shooting routine (50 makes, charting %)", "Aggressive drive drills — attack the basket to draw contact", "And-one finishing: absorb contact and complete the play", "Pump-fake draw-foul technique from mid-range"],
                    "Average": ["Free-throw shooting under fatigue (end of practice)", "Rip-through move drills to draw shooting fouls", "Shot-fake up-and-under finishing"],
                    "Strength": ["Maintain free-throw consistency with pressure shooting", "Advanced: euro-step and craft moves to draw fouls"],
                  },
                };
                return drills[key]?.[status] || drills[key]?.["Average"] || [];
              };

              // Team analysis
              const teamFactorsPerGame = sortedGames.map(g => calcFourFactors({ ...g.teamStats, oppDrb: n(g.oppLine.drb) }));
              const teamAnalysis = analyzeEntity(teamFactorsPerGame);

              // Player analysis
              const playerAnalyses = {};
              for (const name of allPlayerNames) {
                const pFactors = [];
                for (const g of sortedGames) {
                  const p = g.players.find(pl => pl.name === name);
                  if (p && n(p.fga) > 0) {
                    pFactors.push(calcFourFactors({ ...p, oppDrb: n(g.oppLine.drb) / Math.max(g.players.length, 1) }));
                  }
                }
                if (pFactors.length > 0) playerAnalyses[name] = analyzeEntity(pFactors);
              }

              const DevCard = ({ title, analysis, isTeam }) => {
                if (!analysis) return null;
                const topFocus = analysis.prioritized.slice(0, 2);
                return (
                  <div style={{ background: "var(--card-bg)", borderRadius: 10, padding: 16, border: "1px solid var(--border)", marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</div>

                    {/* Factor status grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                      {Object.entries(analysis.factors).map(([key, f]) => {
                        const meta = FACTOR_META[key];
                        return (
                          <div key={key} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 16, marginBottom: 2 }}>{meta.icon}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>{meta.name}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: f.statusColor, marginBottom: 2 }}>{fmtPct(f.avg)}</div>
                            <div style={{ fontSize: 9, fontWeight: 600, color: f.statusColor, marginBottom: 2 }}>{f.statusLabel}</div>
                            <div style={{ fontSize: 9, color: f.trendColor, fontWeight: 600 }}>
                              {f.trendLabel === "Improving" ? "↗" : f.trendLabel === "Declining" ? "↘" : "→"} {f.trendLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Top development priorities */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {isTeam ? "Team Practice Focus" : "Player Development Focus"}
                    </div>
                    {topFocus.map(([key, f]) => {
                      const meta = FACTOR_META[key];
                      const drills = getDrills(key, f.statusLabel);
                      return (
                        <div key={key} style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "var(--bg)", border: `1px solid var(--border)`, borderLeft: `3px solid ${meta.color}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{meta.icon} {meta.name} — {f.statusLabel}</span>
                            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: f.statusColor, fontWeight: 700 }}>
                              {fmtPct(f.avg)} <span style={{ color: f.trendColor, fontSize: 10 }}>({f.trendLabel})</span>
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                            {f.gapFromBenchmark >= 0
                              ? `${fmt(Math.abs(f.gapFromBenchmark))} pts above league avg`
                              : `${fmt(Math.abs(f.gapFromBenchmark))} pts below league avg — priority area`}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Recommended Drills:</div>
                          {drills.map((d, di) => (
                            <div key={di} style={{ fontSize: 11, color: "var(--muted)", paddingLeft: 12, marginBottom: 2, position: "relative" }}>
                              <span style={{ position: "absolute", left: 0, color: meta.color }}>•</span> {d}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              };

              return (
                <>
                  {teamAnalysis && <DevCard title="Team Overview" analysis={teamAnalysis} isTeam />}

                  {Object.keys(playerAnalyses).length > 0 && (
                    <>
                      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 8 }}>Individual Player Development</h3>
                      {Object.entries(playerAnalyses).map(([name, analysis]) => (
                        <DevCard key={name} title={name} analysis={analysis} isTeam={false} />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Four Factors Reference */}
        <div style={{ marginTop: 32, padding: 16, background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dean Oliver's Four Factors Reference</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {Object.entries(FOUR_FACTORS_INFO).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{v.name}</span> ({v.weight}): {v.desc}
                <br /><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{v.formula}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
