const { useState, useEffect, useCallback } = React;

function SearchTab() {
  const [q, setQ] = useState('');
  const [videoId, setVideoId] = useState('all');
  const [topK, setTopK] = useState(5);
  const [mmr, setMmr] = useState(true);
  const [threshold, setThreshold] = useState(0.0);
  const [hits, setHits] = useState([]);
  const [videos, setVideos] = useState([]);
  const [recents, setRecents] = useState([]);
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    LectureApi.listVideos().then(setVideos).catch((e) => setError(e.message));
  }, []);

  const run = useCallback(async (override) => {
    const query = (override ?? q).trim();
    if (!query) return;
    if (override) setQ(query);
    setLoading(true); setError(null); setActiveQuery(query);
    try {
      const opts = {
        query, top_k: topK, use_mmr: mmr,
        video_id: videoId === 'all' ? null : videoId,
        score_threshold: threshold > 0 ? threshold : null,
      };
      const results = await LectureApi.search(opts);
      setHits(results);
      setRecents(prev => [query, ...prev.filter(r => r !== query)].slice(0, 6));
      setRunKey(k => k + 1);
    } catch (e) {
      setHits([]); setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, topK, mmr, videoId, threshold]);

  const filtered = hits.filter(h => h.similarity_score >= threshold).slice(0, topK);
  const videoOptions = [{ value: 'all', label: 'All videos' }, ...videos.map(v => ({ value: String(v.id), label: v.title }))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px auto', gap: 12, alignItems: 'end' }}>
        <Field label="Search query">
          <TextInput value={q} onChange={setQ} placeholder="What was discussed?" onKeyDown={(e) => e.key === 'Enter' && run()} />
        </Field>
        <Field label="Filter by video">
          <Select value={videoId} onChange={setVideoId} options={videoOptions} />
        </Field>
        <Button variant="primary" icon="search" onClick={() => run()} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {recents.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--ls-font-mono)', color: 'var(--ls-fg-subtle)', marginRight: 4 }}>recent</span>
          {recents.map(r => (
            <button key={r} onClick={() => run(r)}
              style={{
                border: '1px solid var(--ls-border)', background: 'var(--ls-bg-elev)',
                color: 'var(--ls-fg-muted)', fontSize: 12,
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                fontFamily: 'var(--ls-font-sans)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ls-accent-soft)'; e.currentTarget.style.color = 'var(--ls-indigo)'; e.currentTarget.style.borderColor = 'var(--ls-accent-ring)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ls-bg-elev)'; e.currentTarget.style.color = 'var(--ls-fg-muted)'; e.currentTarget.style.borderColor = 'var(--ls-border)'; }}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ls-fg-muted)' }}>
          Top K
          <Slider value={topK} onChange={setTopK} min={1} max={10} />
          <span style={{ fontFamily: 'var(--ls-font-mono)', color: 'var(--ls-fg)' }}>{topK}</span>
        </label>
        <Toggle on={mmr} onChange={setMmr} label="MMR diversity" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ls-fg-muted)' }}>
          Score ≥
          <Slider value={threshold} onChange={setThreshold} min={0} max={1} step={0.05} />
          <span style={{ fontFamily: 'var(--ls-font-mono)', color: 'var(--ls-fg)' }}>{threshold.toFixed(2)}</span>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>{loading ? 'searching…' : `${filtered.length} matches`}</Eyebrow>
        <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
          k={topK} · mmr={mmr ? 'on' : 'off'}
        </span>
      </div>

      {error && (
        <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && <SearchSkeletons />}

      {!loading && (
        <div key={runKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((hit, i) => <ResultCard key={hit.chunk_id} hit={hit} index={i} query={activeQuery} />)}
          {filtered.length === 0 && activeQuery && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ls-fg-muted)', fontSize: 14 }}>
              No matches above the threshold.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSkeletons() {
  const sk = {
    background: 'linear-gradient(90deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.25) 50%, rgba(148,163,184,0.10) 100%)',
    backgroundSize: '200% 100%',
    animation: 'lsShimmer 1.4s linear infinite',
    borderRadius: 6,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: '#fff', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...sk, height: 14, width: '40%' }} />
          <div style={{ ...sk, height: 6, width: '100%' }} />
          <div style={{ ...sk, height: 12, width: '92%' }} />
          <div style={{ ...sk, height: 12, width: '74%' }} />
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SearchTab });
