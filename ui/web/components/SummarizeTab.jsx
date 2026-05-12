const { useState, useEffect } = React;

function SummarizeTab() {
  const [videos, setVideos] = useState([]);
  const [videoId, setVideoId] = useState('');
  const [length, setLength] = useState('medium');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revealKey, setRevealKey] = useState(0);

  useEffect(() => {
    LectureApi.listVideos().then(vs => {
      const processed = vs.filter(v => v.processed);
      setVideos(processed);
      if (processed.length && !videoId) setVideoId(String(processed[0].id));
    }).catch(e => setError(e.message));
  }, []);

  const run = async () => {
    if (!videoId) return;
    setLoading(true); setError(null); setSummary(null);
    try {
      const s = await LectureApi.summarize(videoId, length);
      setSummary(s);
      setRevealKey(k => k + 1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const activeTitle = videos.find(v => String(v.id) === videoId)?.title;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: 12, alignItems: 'end' }}>
        <Field label="Lecture">
          <Select value={videoId} onChange={setVideoId}
            options={videos.map(v => ({ value: String(v.id), label: v.title }))} />
        </Field>
        <Field label="Length">
          <Select value={length} onChange={setLength}
            options={[
              { value: 'short',  label: 'Short' },
              { value: 'medium', label: 'Medium' },
              { value: 'long',   label: 'Long' },
            ]} />
        </Field>
        <Button variant="primary" icon="sparkles" onClick={run} disabled={loading || !videoId}>
          {loading ? 'Summarizing…' : 'Summarize'}
        </Button>
      </div>

      {error && (
        <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && <SummarySkeleton />}

      {summary && !loading && (
        <div key={revealKey} style={{
          background: 'var(--ls-bg-elev)', border: '1px solid var(--ls-border)',
          borderRadius: 14, padding: 22,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          display: 'flex', flexDirection: 'column', gap: 14,
          animation: 'lsFadeInUp 650ms cubic-bezier(0.22,1,0.36,1) backwards',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>{length} summary</Eyebrow>
            <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
              {activeTitle}
            </span>
          </div>
          <div style={{
            fontSize: 16, lineHeight: 1.8, color: 'var(--ls-fg)',
            unicodeBidi: 'plaintext', textAlign: 'start', whiteSpace: 'pre-wrap',
          }}>{summary}</div>
        </div>
      )}
    </div>
  );
}

function SummarySkeleton() {
  const skeleton = {
    background: 'linear-gradient(90deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.25) 50%, rgba(148,163,184,0.10) 100%)',
    backgroundSize: '200% 100%',
    animation: 'lsShimmer 1.4s linear infinite',
    borderRadius: 6,
  };
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(148,163,184,0.25)',
      borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ ...skeleton, height: 14, width: '32%' }} />
      <div style={{ ...skeleton, height: 14, width: '92%' }} />
      <div style={{ ...skeleton, height: 14, width: '87%' }} />
      <div style={{ ...skeleton, height: 14, width: '78%' }} />
    </div>
  );
}

Object.assign(window, { SummarizeTab });
