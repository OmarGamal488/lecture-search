const { useState, useEffect } = React;

const TABS = [
  { id: 'search',    icon: 'search',              label: 'Search' },
  { id: 'ask',       icon: 'message-square-text', label: 'Ask' },
  { id: 'upload',    icon: 'upload-cloud',        label: 'Upload' },
  { id: 'videos',    icon: 'library-big',         label: 'Videos' },
  { id: 'summarize', icon: 'scroll-text',         label: 'Summarize' },
  { id: 'stats',     icon: 'bar-chart-3',         label: 'Stats' },
];

function App() {
  const [tab, setTab] = useState('search');
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Live data for the ⌘K palette.
  const [videos, setVideos] = useState([]);
  const [recents, setRecents] = useState([]);

  useEffect(() => {
    LectureApi.listVideos().then(setVideos).catch(() => { /* sidebar surfaces health */ });
  }, [tab]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const renderTab = () => {
    switch (tab) {
      case 'search':    return <SearchTab />;
      case 'ask':       return <AskTab />;
      case 'upload':    return <UploadTab />;
      case 'videos':    return <VideosTab />;
      case 'summarize': return <SummarizeTab />;
      case 'stats':     return <StatsTab />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--ls-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 5,
          padding: '18px 32px 0',
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--ls-divider)',
        }}>
          <h1 style={{
            margin: '0 0 18px', fontSize: 38, fontWeight: 700, letterSpacing: '-0.015em',
            background: 'linear-gradient(90deg, #4338ca 0%, #c026d3 50%, #f59e0b 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            animation: 'lsTitleDrift 9s ease-in-out infinite',
          }}>Lecture Search</h1>
          <div style={{
            position: 'absolute', top: 22, right: 32,
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid var(--ls-border)', borderRadius: 8,
            padding: '6px 10px 6px 12px', cursor: 'pointer',
            background: 'var(--ls-bg-elev)',
            color: 'var(--ls-fg-muted)', fontSize: 13,
            fontFamily: 'var(--ls-font-sans)',
            transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
          }} onClick={() => setPaletteOpen(true)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ls-accent-ring)'; e.currentTarget.style.color = 'var(--ls-indigo)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--ls-border)'; e.currentTarget.style.color = 'var(--ls-fg-muted)'; }}>
            <Icon name="search" size={14} />
            <span>Quick jump</span>
            <kbd style={{
              fontSize: 11, fontFamily: 'var(--ls-font-mono)',
              border: '1px solid var(--ls-border)', borderRadius: 4,
              padding: '1px 6px', background: 'var(--ls-bg)',
            }}>⌘K</kbd>
          </div>
          <nav style={{ display: 'flex', gap: 4 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: '10px 14px 14px',
                  fontSize: 14, fontWeight: 600,
                  color: tab === t.id ? 'var(--ls-fg)' : 'var(--ls-fg-muted)',
                  borderBottom: `2px solid ${tab === t.id ? 'var(--ls-blue)' : 'transparent'}`,
                  transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginBottom: -1,
                }}>
                <Icon name={t.icon} size={16} color={tab === t.id ? 'var(--ls-blue)' : 'currentColor'} />
                {t.label}
              </button>
            ))}
          </nav>
        </header>
        <section style={{ padding: '28px 32px 56px', maxWidth: 980, width: '100%' }}>
          {renderTab()}
        </section>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
        onJumpTab={setTab}
        recents={recents}
        videos={videos.slice(0, 8).map(v => ({ id: v.id, title: v.title }))} />
    </div>
  );
}

Object.assign(window, { App });
