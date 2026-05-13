const { useState, useEffect, useRef } = React;

function AskTab() {
  const [q, setQ] = useState('What are the ACID properties of a transaction?');
  const [streaming, setStreaming] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [topK, setTopK] = useState(5);
  const [phase, setPhase] = useState('idle'); // idle | thinking | streaming | done | error
  const [tokens, setTokens] = useState([]);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const stopRef = useRef(null);
  // Buffer the full streamed answer so we can re-tokenize for [N] citations.
  const fullTextRef = useRef('');

  const reset = () => { setTokens([]); setSources([]); setError(null); fullTextRef.current = ''; };

  const ask = async () => {
    if (!q.trim() || phase === 'thinking' || phase === 'streaming') return;
    reset();
    setPhase('thinking');

    // Fetch sources in parallel — the streaming endpoint doesn't include them,
    // but the design reveals source cards once the answer is done. We use
    // /search (same retriever) which mirrors what the streaming chain does
    // internally for retrieval.
    const sourcesP = LectureApi.search({ query: q, top_k: topK, use_mmr: false });

    if (streaming) {
      // Brief delay so the ThinkingBar shows even on snappy endpoints.
      await new Promise(r => setTimeout(r, 350));
      setPhase('streaming');
      stopRef.current = LectureApi.streamAnswer(
        { question: q, top_k: topK },
        (tok) => {
          fullTextRef.current += tok;
          // Split incoming token in case it includes a [N] marker mid-stream.
          setTokens(prev => {
            const out = [...prev];
            const re = /\[(\d+)\]/g;
            let last = 0; let m;
            while ((m = re.exec(tok))) {
              if (m.index > last) out.push(tok.slice(last, m.index));
              out.push(`[${m[1]}]`);
              last = m.index + m[0].length;
            }
            if (last < tok.length) out.push(tok.slice(last));
            return out;
          });
        },
        async () => {
          try {
            const srcs = await sourcesP;
            setSources(srcs.slice(0, topK));
          } catch { /* sources are optional; ignore */ }
          setPhase('done');
        },
        (e) => { setError(e.message); setPhase('error'); }
      );
    } else {
      try {
        const r = await LectureApi.ask({ question: q, top_k: topK });
        // Tokenize the final answer for citation handling.
        const raw = r.answer || '';
        const out = [];
        const re = /\[(\d+)\]/g;
        let last = 0; let m;
        while ((m = re.exec(raw))) {
          if (m.index > last) out.push(raw.slice(last, m.index));
          out.push(`[${m[1]}]`);
          last = m.index + m[0].length;
        }
        if (last < raw.length) out.push(raw.slice(last));
        setTokens(out);
        setSources(r.sources || []);
        setPhase('done');
      } catch (e) { setError(e.message); setPhase('error'); }
    }
  };

  useEffect(() => () => stopRef.current && stopRef.current(), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Field label="Ask a question about your lectures">
        <Textarea value={q} onChange={setQ} rows={3} />
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Toggle on={streaming} onChange={setStreaming} label="Stream answer" />
        <Toggle on={showSources} onChange={setShowSources} label="Show sources" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ls-fg-muted)' }}>
          Top K
          <Slider value={topK} onChange={setTopK} min={1} max={10} />
          <span style={{ fontFamily: 'var(--ls-font-mono)', color: 'var(--ls-fg)' }}>{topK}</span>
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="accent" icon="sparkles" onClick={ask} disabled={phase === 'thinking' || phase === 'streaming'}>
            {phase === 'streaming' ? 'Streaming…' : phase === 'thinking' ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {phase !== 'idle' && phase !== 'error' && (
        <div style={{
          background: 'var(--ls-bg-elev)', border: '1px solid var(--ls-border)',
          borderRadius: 14, padding: 22,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <Eyebrow>Answer</Eyebrow>
          {phase === 'thinking' && <ThinkingBar />}
          {phase === 'streaming' && <Answer tokens={tokens} showCaret={true} />}
          {phase === 'done' && <MarkdownAnswer text={fullTextRef.current || tokens.join('')} />}
          {phase === 'done' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
              paddingTop: 12, borderTop: '1px solid var(--ls-divider)',
              fontSize: 12, color: 'var(--ls-fg-subtle)',
              fontFamily: 'var(--ls-font-sans)',
            }}>
              <Icon name="check-circle-2" size={14} color="var(--ls-emerald)" />
              <span>Grounded in {sources.length} source{sources.length === 1 ? '' : 's'} below</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                <FootBtn icon="copy" onClick={() => navigator.clipboard?.writeText(tokens.join(''))}>Copy</FootBtn>
                <FootBtn icon="thumbs-up" />
                <FootBtn icon="thumbs-down" />
              </span>
            </div>
          )}
        </div>
      )}

      {showSources && phase === 'done' && sources.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>Sources ({sources.length})</Eyebrow>
          {sources.map((hit, i) => (
            <div key={hit.chunk_id} style={{ animation: `lsFadeInUp 320ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms backwards` }}>
              <ResultCard hit={hit} index={0} anchorId={`source-${i + 1}`} badge={`[${i + 1}]`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ls-fg-muted)', fontSize: 13 }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 5, height: 5, borderRadius: 999,
              background: 'var(--ls-indigo)',
              animation: `lsDotPulse 1.2s ease-in-out ${i * 0.18}s infinite`,
            }} />
          ))}
        </span>
        <span>Retrieving relevant chunks…</span>
      </div>
      <div style={{
        height: 6, borderRadius: 999, overflow: 'hidden',
        background: 'var(--ls-divider)', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, #4338ca 30%, #c026d3 50%, #f59e0b 70%, transparent 100%)',
          backgroundSize: '50% 100%',
          animation: 'lsThinkSweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        }} />
      </div>
    </div>
  );
}

// Final rendered answer once the stream completes. Parses markdown via
// `marked` (loaded from CDN in index.html) and turns `[N]` citation
// markers into clickable chips that anchor to the source cards below.
function MarkdownAnswer({ text }) {
  const ref = React.useRef(null);

  // Re-bind click handlers / smooth-scroll the citation chips after every
  // re-render. We rely on plain anchors so reduced-motion users get
  // browser-native instant jump.
  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('a.ls-cite').forEach((el) => {
      el.onclick = (e) => {
        const id = el.getAttribute('href')?.slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
  }, [text]);

  const html = React.useMemo(() => renderAnswerMarkdown(text), [text]);

  return (
    <div ref={ref}
      className="ls-answer-md ls-bi"
      style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--ls-fg)', unicodeBidi: 'plaintext', textAlign: 'start' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// 1. Replace `[N]` with a sentinel so marked doesn't touch it.
// 2. Run marked on the rest (bold/italic/code/lists/headings/blockquotes).
// 3. Replace the sentinel with the citation-chip <a> markup that anchors
//    to `#source-N` and matches the same styling as the streaming chips.
function renderAnswerMarkdown(text) {
  if (!text) return '';
  const safe = String(text);
  const sentinel = 'CITE';
  const citations = [];
  const withSentinels = safe.replace(/\[(\d+)\]/g, (_m, n) => {
    citations.push(Number(n));
    return `${sentinel}${citations.length - 1}${sentinel}`;
  });
  let html;
  try {
    if (typeof window.marked === 'undefined') {
      // Fallback: just paragraph-break the raw text if marked failed to load.
      html = safe
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');
    } else {
      html = window.marked.parse(withSentinels, { gfm: true, breaks: true });
    }
  } catch {
    html = safe;
  }
  // Reinsert citation chips.
  html = html.replace(
    new RegExp(`${sentinel}(\\d+)${sentinel}`, 'g'),
    (_m, idx) => {
      const n = citations[Number(idx)];
      return (
        `<a class="ls-cite" href="#source-${n}" ` +
        `style="display:inline-flex;align-items:center;padding:1px 7px;margin:0 2px;` +
        `font-family:var(--ls-font-mono);font-size:11px;font-weight:700;` +
        `color:var(--ls-blue);background:var(--ls-accent-soft);` +
        `border-radius:6px;text-decoration:none;vertical-align:baseline;">` +
        `${n}</a>`
      );
    }
  );
  return html;
}

function Answer({ tokens, showCaret }) {
  return (
    <div style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--ls-fg)', unicodeBidi: 'plaintext', textAlign: 'start' }}>
      {tokens.map((t, i) => {
        const m = t.match(/^\[(\d+)\]$/);
        if (m) {
          const n = Number(m[1]);
          return (
            <a key={i} href={`#source-${n}`}
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '1px 7px', margin: '0 2px',
                fontFamily: 'var(--ls-font-mono)', fontSize: 11, fontWeight: 700,
                color: 'var(--ls-blue)', background: 'var(--ls-accent-soft)',
                borderRadius: 6, textDecoration: 'none', verticalAlign: 'baseline',
                animation: 'lsTokenIn 180ms cubic-bezier(0.22,1,0.36,1) backwards',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ls-blue)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ls-accent-soft)'; e.currentTarget.style.color = 'var(--ls-blue)'; }}>
              {n}
            </a>
          );
        }
        return (
          <span key={i} style={{ animation: 'lsTokenIn 180ms cubic-bezier(0.22,1,0.36,1) backwards' }}>{t}</span>
        );
      })}
      {showCaret && (
        <span style={{
          display: 'inline-block', width: 2, height: '1.05em', background: 'var(--ls-blue)',
          verticalAlign: 'text-bottom', marginLeft: 2,
          animation: 'lsCaretBlink 900ms steps(1) infinite',
        }} />
      )}
    </div>
  );
}

function FootBtn({ icon, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      border: '1px solid var(--ls-border)', background: 'var(--ls-bg-elev)',
      borderRadius: 6, padding: '3px 7px', cursor: 'pointer',
      fontSize: 11, fontFamily: 'var(--ls-font-sans)',
      color: 'var(--ls-fg-muted)',
      transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ls-indigo)'; e.currentTarget.style.borderColor = 'var(--ls-accent-ring)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ls-fg-muted)'; e.currentTarget.style.borderColor = 'var(--ls-border)'; }}>
      <Icon name={icon} size={12} />{children}
    </button>
  );
}

Object.assign(window, { AskTab });
