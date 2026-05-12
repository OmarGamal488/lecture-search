const { useState, useEffect, useCallback } = React;

function fmtDuration(s) {
  if (!s || !isFinite(s)) return '—';
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function VideosTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [chunkCache, setChunkCache] = useState({});

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setVideos(await LectureApi.listVideos()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Lazy-load chunk preview when a card is expanded.
  useEffect(() => {
    if (expanded == null) return;
    if (chunkCache[expanded]) return;
    LectureApi.videoDetails(expanded).then(d => {
      setChunkCache(prev => ({ ...prev, [expanded]: d.chunks || [] }));
    }).catch(() => { /* swallow */ });
  }, [expanded, chunkCache]);

  const onDelete = useCallback(async (id) => {
    if (!confirm('Delete this video and all its chunks?')) return;
    try {
      await LectureApi.deleteVideo(id);
      setVideos(prev => prev.filter(v => v.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (e) { alert(e.message); }
  }, [expanded]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>Library · {videos.length} video{videos.length === 1 ? '' : 's'}</Eyebrow>
        <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
          {videos.filter(v => v.processed).length} processed · {videos.filter(v => !v.processed).length} pending
        </span>
      </div>

      {error && (
        <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {[0, 1, 2, 3].map(i => <VideoSkeleton key={i} />)}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {videos.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i}
              expanded={expanded === v.id}
              chunks={chunkCache[v.id]}
              onClick={() => setExpanded(expanded === v.id ? null : v.id)}
              onDelete={() => onDelete(v.id)} />
          ))}
          {videos.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ls-fg-muted)', fontSize: 14, gridColumn: '1 / -1' }}>
              No videos yet. Upload an MP4 from the Upload tab.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, index, expanded, chunks, onClick, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--ls-bg-elev)', border: `1px solid ${hover ? 'rgba(67,56,202,0.45)' : 'rgba(148,163,184,0.25)'}`,
        borderRadius: 14, padding: 16,
        boxShadow: hover ? '0 10px 28px rgba(15,23,42,0.10)' : '0 1px 2px rgba(15,23,42,0.04)',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        animation: `lsFadeInUp 320ms cubic-bezier(0.22,1,0.36,1) ${index * 55}ms backwards`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ls-fg)', lineHeight: 1.35 }}>{video.title}</div>
          <div style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>{video.filename}</div>
        </div>
        <StatusBadge processed={video.processed} />
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={12} /> {fmtDuration(video.duration)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="layers" size={12} /> {video.num_chunks ?? '—'} chunks</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={12} /> {fmtDate(video.upload_date)}</span>
      </div>
      <div style={{
        display: 'flex', gap: 8, marginTop: 4,
        opacity: hover || expanded ? 1 : 0, transition: 'opacity 180ms',
      }}>
        <Button variant="secondary" icon="chevrons-up-down" onClick={onClick}>{expanded ? 'Collapse' : 'Inspect'}</Button>
        <Button variant="danger" icon="trash-2" onClick={onDelete}>Delete</Button>
      </div>
      {expanded && video.processed && (
        <div style={{
          marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--ls-divider)',
          display: 'flex', flexDirection: 'column', gap: 6,
          animation: 'lsFadeInUp 320ms cubic-bezier(0.22,1,0.36,1) backwards',
        }}>
          <Eyebrow>First few chunks</Eyebrow>
          {(chunks || []).slice(0, 3).map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
              <span style={{ width: 36 }}>{`#${c.chunk_index}`}</span>
              <span>{fmtDuration(c.start_time)} – {fmtDuration(c.end_time)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ls-fg)', unicodeBidi: 'plaintext' }}>{c.text}</span>
            </div>
          ))}
          {!chunks && <span style={{ fontSize: 11, color: 'var(--ls-fg-subtle)' }}>loading…</span>}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ processed }) {
  if (processed) {
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
        fontFamily: 'var(--ls-font-mono)', color: 'hsl(150,70%,32%)', background: 'rgba(34,197,94,0.14)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <Icon name="check" size={11} /> processed
      </span>
    );
  }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      fontFamily: 'var(--ls-font-mono)', color: '#92400e', background: 'rgba(245,158,11,0.16)',
      animation: 'lsPendingPulse 1.8s ease-in-out infinite',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Icon name="circle-dot" size={11} /> pending
    </span>
  );
}

function VideoSkeleton() {
  const sk = {
    background: 'linear-gradient(90deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.25) 50%, rgba(148,163,184,0.10) 100%)',
    backgroundSize: '200% 100%',
    animation: 'lsShimmer 1.4s linear infinite',
    borderRadius: 6,
  };
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...sk, height: 14, width: '70%' }} />
      <div style={{ ...sk, height: 10, width: '50%' }} />
      <div style={{ ...sk, height: 10, width: '40%' }} />
    </div>
  );
}

Object.assign(window, { VideosTab });
