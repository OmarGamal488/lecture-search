const { useState: useStateCP, useEffect: useEffectCP, useRef: useRefCP, useMemo: useMemoCP } = React;

// ⌘K palette — quick-jump between tabs, recent queries, and recent videos.
// Opens on ⌘K / Ctrl-K, closes on Esc. Arrow keys + Enter to pick.
function CommandPalette({ open, onClose, onJumpTab, onAskQuery, recents = [], videos = [] }) {
  const [q, setQ] = useStateCP('');
  const [idx, setIdx] = useStateCP(0);
  const inputRef = useRefCP(null);

  useEffectCP(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const TABS_CMD = [
    { kind: 'tab', id: 'search',    label: 'Go to Search',    icon: 'search',              hint: 'Tab' },
    { kind: 'tab', id: 'ask',       label: 'Go to Ask',       icon: 'message-square-text', hint: 'Tab' },
    { kind: 'tab', id: 'upload',    label: 'Go to Upload',    icon: 'upload-cloud',        hint: 'Tab' },
    { kind: 'tab', id: 'videos',    label: 'Go to Videos',    icon: 'library-big',         hint: 'Tab' },
    { kind: 'tab', id: 'summarize', label: 'Go to Summarize', icon: 'scroll-text',         hint: 'Tab' },
    { kind: 'tab', id: 'stats',     label: 'Go to Stats',     icon: 'bar-chart-3',         hint: 'Tab' },
  ];

  const items = useMemoCP(() => {
    const all = [
      ...TABS_CMD,
      ...recents.slice(0, 4).map(r => ({ kind: 'recent', id: r, label: r, icon: 'history', hint: 'Search' })),
      ...videos.slice(0, 4).map(v => ({ kind: 'video', id: v.id, label: v.title, icon: 'video', hint: 'Open' })),
      { kind: 'ask', id: 'new-question', label: q ? `Ask: "${q}"` : 'Ask a new question', icon: 'sparkles', hint: 'AI' },
    ];
    if (!q) return all;
    const needle = q.toLowerCase();
    return all.filter(it => it.label.toLowerCase().includes(needle) || it.kind === 'ask');
  }, [q, recents, videos]);

  useEffectCP(() => { setIdx(0); }, [q]);

  const pick = (it) => {
    onClose();
    if (it.kind === 'tab') onJumpTab(it.id);
    else if (it.kind === 'recent') { onJumpTab('search'); onAskQuery?.('search', it.label); }
    else if (it.kind === 'video') onJumpTab('videos');
    else if (it.kind === 'ask') { onJumpTab('ask'); onAskQuery?.('ask', q); }
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx] && pick(items[idx]); }
    else if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '14vh',
      animation: 'lsFadeIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 560, maxWidth: '90vw',
        background: 'var(--ls-bg-elev)',
        border: '1px solid var(--ls-border)',
        borderRadius: 14,
        boxShadow: '0 24px 48px rgba(15,23,42,0.25), 0 8px 16px rgba(15,23,42,0.15)',
        overflow: 'hidden',
        animation: 'lsCardEnter 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: '1px solid var(--ls-divider)',
        }}>
          <Icon name="search" size={18} color="var(--ls-fg-muted)" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Jump to a tab, recent search, or ask a question…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--ls-fg)',
              fontFamily: 'var(--ls-font-sans)',
            }} />
          <kbd style={{
            fontSize: 11, fontFamily: 'var(--ls-font-mono)',
            color: 'var(--ls-fg-subtle)',
            border: '1px solid var(--ls-border)', borderRadius: 4,
            padding: '2px 6px', background: 'var(--ls-bg)',
          }}>esc</kbd>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {items.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ls-fg-subtle)', fontSize: 13 }}>
              No matches
            </div>
          )}
          {items.map((it, i) => {
            const active = i === idx;
            return (
              <div key={`${it.kind}-${it.id}-${i}`}
                onMouseEnter={() => setIdx(i)} onClick={() => pick(it)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', cursor: 'pointer',
                  background: active ? 'var(--ls-accent-soft)' : 'transparent',
                  color: active ? 'var(--ls-indigo)' : 'var(--ls-fg)',
                  fontSize: 14,
                  transition: 'background 120ms',
                }}>
                <Icon name={it.icon} size={16} color={active ? 'var(--ls-indigo)' : 'var(--ls-fg-muted)'} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.label}
                </span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--ls-font-mono)', textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--ls-fg-subtle)',
                }}>{it.hint}</span>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex', gap: 14, padding: '10px 16px',
          borderTop: '1px solid var(--ls-divider)',
          fontSize: 11, fontFamily: 'var(--ls-font-mono)',
          color: 'var(--ls-fg-subtle)',
        }}>
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CommandPalette });
