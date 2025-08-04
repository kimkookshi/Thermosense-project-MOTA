import React, { useEffect, useRef, useState } from 'react';

type Level = 'safe' | 'caution' | 'danger';
type Row = {
  t: number;
  battery: number;
  ambient: number;
  level: Level;
  tip: string;
};

const judge = (battery: number, ambient: number) => {
  if (battery >= 47)
    return {
      level: 'danger' as Level,
      score: 1,
      tip: 'Battery is very hot. Move to a cooler place, close apps, reduce brightness.',
    };
  if (battery >= 43)
    return {
      level: 'caution' as Level,
      score: 0.66,
      tip: 'Battery getting warm. Take a break from charging and reduce brightness.',
    };
  if (battery - ambient >= 10)
    return {
      level: 'caution' as Level,
      score: 0.6,
      tip: 'Heating faster than ambient. Avoid gaming or heavy apps.',
    };
  return {
    level: 'safe' as Level,
    score: 0.25,
    tip: 'All good. Keep normal use.',
  };
};

// Simple SVG line chart (no external libs)
function MiniChart({ data }: { data: Row[] }) {
  const width = 700,
    height = 240,
    pad = 30;
  const viewW = width - pad * 2;
  const viewH = height - pad * 2;

  const last = data.slice(-60); // show last ~5 min (at 5s/point)
  const xs = last.map((_, i) => (i / Math.max(1, last.length - 1)) * viewW);

  // Fix y-range so the chart is stable
  const yMin = 20,
    yMax = 55;
  const yScale = (v: number) => pad + (1 - (v - yMin) / (yMax - yMin)) * viewH;

  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + xs[i]} ${yScale(v)}`)
      .join(' ');

  const batPath = toPath(last.map((r) => r.battery));
  const ambPath = toPath(last.map((r) => r.ambient));

  // grid lines
  const gridY = [20, 30, 40, 50];
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* background */}
      <rect x={0} y={0} width={width} height={height} fill="#0b1220" rx={12} />
      <rect
        x={pad}
        y={pad}
        width={viewW}
        height={viewH}
        fill="#0f172a"
        stroke="#1f2a44"
        rx={8}
      />
      {/* grid */}
      {gridY.map((g) => (
        <g key={g}>
          <line
            x1={pad}
            x2={pad + viewW}
            y1={yScale(g)}
            y2={yScale(g)}
            stroke="#1f2a44"
            strokeDasharray="4 6"
          />
          <text x={6} y={yScale(g) + 4} fontSize="11" fill="#8fa1c1">
            {g}°C
          </text>
        </g>
      ))}
      {/* lines */}
      <path
        d={ambPath}
        fill="none"
        stroke="#8fa1c1"
        strokeWidth={2}
        strokeDasharray="6 6"
      />
      <path d={batPath} fill="none" stroke="#93c5fd" strokeWidth={2} />
      {/* legend */}
      <g transform={`translate(${pad},${pad - 8})`}>
        <rect x={0} y={-16} width={12} height={2} fill="#93c5fd" />
        <text x={18} y={-12} fill="#e6edf6" fontSize="12">
          Battery °C
        </text>
        <rect x={110} y={-16} width={12} height={2} fill="#8fa1c1" />
        <text x={128} y={-12} fill="#e6edf6" fontSize="12">
          Ambient °C
        </text>
      </g>
    </svg>
  );
}

export default function App() {
  const [ambient, setAmbient] = useState<number>(30);
  const [battery, setBattery] = useState<number>(35);
  const [log, setLog] = useState<Row[]>([]);
  const [running, setRunning] = useState<boolean>(true);
  const [useF, setUseF] = useState<boolean>(false);
  const timer = useRef<number | null>(null);

  // Weather (no API key)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
          const r = await fetch(url);
          const j = await r.json();
          const t = j?.current?.temperature_2m;
          if (typeof t === 'number') setAmbient(t);
        } catch {}
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // Simulate battery and append to log every 5s
  useEffect(() => {
    const tick = () => {
      const workload = Math.random() * 6; // 0..6 °C extra heat
      const cool = -Math.max(0, (battery - ambient) * 0.06);
      const next = Math.max(
        20,
        Math.min(55, battery + cool + (workload - 2.5) * 0.4)
      );
      setBattery(next);
      const r = judge(next, ambient);
      setLog((p) => [
        ...p.slice(-350),
        {
          t: Date.now(),
          battery: +next.toFixed(2),
          ambient: +ambient.toFixed(2),
          level: r.level,
          tip: r.tip,
        },
      ]);
    };
    if (running) {
      tick();
      timer.current = window.setInterval(tick, 5000);
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, ambient]); // battery updates inside

  const toF = (c: number) => (c * 9) / 5 + 32;
  const show = (c: number) =>
    useF ? `${toF(c).toFixed(1)} °F` : `${c.toFixed(1)} °C`;

  const last = log[log.length - 1];
  const risk = last
    ? judge(last.battery, last.ambient)
    : judge(battery, ambient);
  const meterPct = Math.round(risk.score * 100);
  const meterColor =
    risk.level === 'danger'
      ? '#e11d48'
      : risk.level === 'caution'
      ? '#f59e0b'
      : '#10b981';

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'thermosense_log.json';
    a.click();
  };

  return (
    <div
      style={{
        maxWidth: 980,
        margin: '24px auto',
        padding: 12,
        color: '#e6edf6',
        fontFamily:
          'ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>ThermoSense</h1>
        <p style={{ opacity: 0.8, margin: '4px 0 0' }}>
          Ambient-Aware Battery Health Advisor
        </p>
      </header>

      {/* Cards */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 12,
          margin: '16px 0',
        }}
      >
        {[
          { label: 'Battery Temperature', value: show(battery) },
          { label: 'Ambient (Weather)', value: show(ambient) },
          { label: 'Risk', value: risk.level.toUpperCase() },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: '#121a2b',
              border: '1px solid #1f2a44',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, opacity: 0.8 }}>{c.label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 24 }}>{c.value}</p>
          </div>
        ))}
      </section>

      {/* Meter */}
      <section>
        <div
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 8,
            height: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${meterPct}%`,
              height: '100%',
              background: meterColor,
              transition: 'width .4s',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            opacity: 0.8,
            marginTop: 6,
          }}
        >
          <span>Safe</span>
          <span>Caution</span>
          <span>Danger</span>
        </div>
      </section>

      {/* Advice */}
      <section
        style={{
          background: '#121a2b',
          border: '1px solid #1f2a44',
          borderRadius: 12,
          padding: 14,
          marginTop: 16,
        }}
      >
        <h3 style={{ margin: '0 0 6px' }}>Advice</h3>
        <p style={{ margin: 0 }}>{risk.tip}</p>
      </section>

      {/* Chart (SVG) */}
      <section
        style={{
          background: '#121a2b',
          border: '1px solid #1f2a44',
          borderRadius: 12,
          padding: 14,
          margin: '16px 0',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Battery vs Ambient (last ~5 min)</h3>
        <MiniChart data={log} />
      </section>

      {/* Controls */}
      <section
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          margin: '16px 0',
        }}
      >
        <button onClick={() => setRunning((s) => !s)}>
          {' '}
          {running ? 'Pause' : 'Resume'}{' '}
        </button>
        <button onClick={() => setUseF((s) => !s)}> Toggle °C / °F </button>
        <button onClick={downloadJSON}> Download JSON Log </button>
      </section>

      <footer style={{ textAlign: 'center', opacity: 0.7, marginTop: 8 }}>
        <small>Rule-based tips; can be swapped with an LLM prompt.</small>
      </footer>
    </div>
  );
}
