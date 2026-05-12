const { useState, useEffect } = React;

function CountUp({ to, duration = 700, decimals = 0 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setN(to); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{n.toFixed(decimals)}</>;
}

function KpiCard({ label, value, decimals = 0, unit, mono }) {
  return (
    <div style={{
      background: 'var(--ls-bg-elev)', border: '1px solid var(--ls-border)',
      borderRadius: 14, padding: 18,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(67,56,202,0.05) 0%, rgba(192,38,211,0.04) 50%, rgba(245,158,11,0.04) 100%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ls-fg-muted)' }}>
          {label}
        </span>
        <span style={{
          fontSize: mono ? 18 : 36, fontWeight: 700, letterSpacing: '-0.015em',
          fontFamily: mono ? 'var(--ls-font-mono)' : 'var(--ls-font-sans)', color: 'var(--ls-fg)',
        }}>
          {mono ? value : <><CountUp to={Number(value) || 0} decimals={decimals} />{unit}</>}
        </span>
      </div>
    </div>
  );
}

function Sparkline({ values, w = 280, h = 60 }) {
  if (!values || values.length < 2) {
    return <div style={{ fontSize: 12, color: 'var(--ls-fg-subtle)' }}>Not enough data for a sparkline yet.</div>;
  }
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 6) - 3}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="sp-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4338ca" /><stop offset="50%" stopColor="#c026d3" /><stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="url(#sp-grad)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 1000, strokeDashoffset: 1000, animation: 'lsSparkDraw 900ms cubic-bezier(0.22,1,0.36,1) forwards' }} />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * (h - 6) - 3} r="2.5" fill="#c026d3" />
      ))}
      <style>{`@keyframes lsSparkDraw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([LectureApi.stats(), LectureApi.listVideos()])
      .then(([s, vs]) => { setStats(s); setVideos(vs); })
      .catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
        {error}
      </div>
    );
  }
  if (!stats) {
    return <Eyebrow>Loading stats…</Eyebrow>;
  }

  const chunksPerVideo = videos.filter(v => v.processed && v.num_chunks != null).map(v => v.num_chunks);
  const lo = chunksPerVideo.length ? Math.min(...chunksPerVideo) : 0;
  const hi = chunksPerVideo.length ? Math.max(...chunksPerVideo) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard label="Total videos"   value={stats.total_videos} />
        <KpiCard label="Processed"      value={stats.processed_videos} />
        <KpiCard label="Total chunks"   value={stats.total_chunks} />
        <KpiCard label="Database size"  value={stats.database_size_mb} decimals={1} unit=" MB" />
      </div>

      <div style={{
        background: 'var(--ls-bg-elev)', border: '1px solid var(--ls-border)',
        borderRadius: 14, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow>Chunks per video</Eyebrow>
          <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
            {lo} – {hi} chunks
          </span>
        </div>
        <Sparkline values={chunksPerVideo} />
      </div>

      <div style={{
        background: 'var(--ls-bg-elev)', border: '1px solid var(--ls-border)',
        borderRadius: 14, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <Eyebrow>Models</Eyebrow>
        <ModelRow label="Embedding"     value={stats.embedding_model} />
        <ModelRow label="LLM"           value={stats.llm_model} />
        <ModelRow label="Whisper"       value={stats.whisper_model} />
        <ModelRow label="Orchestration" value={stats.framework} />
      </div>
    </div>
  );
}

function ModelRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--ls-divider)' }}>
      <span style={{ fontSize: 13, color: 'var(--ls-fg-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 13, color: 'var(--ls-fg)' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { StatsTab });
