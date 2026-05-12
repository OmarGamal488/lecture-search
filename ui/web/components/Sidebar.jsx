const { useState, useEffect } = React;

function Sidebar() {
  const [url, setUrl] = useState(window.LS_API_BASE || window.location.origin);
  const [healthy, setHealthy] = useState(null);

  // Probe /health periodically; update the global so api.js calls hit the
  // same base.
  useEffect(() => {
    window.LS_API_BASE = url;
    let cancelled = false;
    const probe = async () => {
      try { await LectureApi.health(); if (!cancelled) setHealthy(true); }
      catch { if (!cancelled) setHealthy(false); }
    };
    probe();
    const handle = setInterval(probe, 5000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [url]);

  return (
    <aside style={{
      width: 260, padding: 20, borderRight: '1px solid var(--ls-divider)',
      background: 'var(--ls-bg-muted)', display: 'flex', flexDirection: 'column', gap: 18,
      flexShrink: 0,
    }}>
      <img src="assets/wordmark.svg" alt="Lecture Search" style={{ width: 200, height: 'auto' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Field label="Backend URL">
          <TextInput value={url} onChange={setUrl} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: healthy === null ? 'var(--ls-fg-subtle)' : healthy ? 'hsl(150,70%,48%)' : '#dc2626',
            boxShadow:
              healthy === null ? '0 0 0 4px rgba(148,163,184,0.18)'
                : healthy ? '0 0 0 4px rgba(34,197,94,0.18)'
                : '0 0 0 4px rgba(220,38,38,0.18)',
          }} />
          <span style={{ color: 'var(--ls-fg-muted)', fontFamily: 'var(--ls-font-mono)' }}>
            {healthy === null ? 'API · …' : healthy ? 'API · 200 OK' : 'API · offline'}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--ls-fg-subtle)', lineHeight: 1.55 }}>
        Self-hosted · single-user.<br />
        Semantic search + RAG over your lectures.
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
