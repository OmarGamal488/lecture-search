// ResultCard — used for search hits and Ask sources.
const { useState } = React;

function ResultCard({ hit, index = 0, anchorId, badge, query = '' }) {
  const [expanded, setExpanded] = useState(false);
  const fullText = hit.text;
  const visible = expanded || fullText.length <= 180 ? fullText : fullText.slice(0, 180) + '…';
  const text = highlight(visible, query);

  return (
    <div id={anchorId}
      style={{
        background: '#fff', border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 14, padding: 18,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        animation: `lsFadeInUp 320ms cubic-bezier(0.22,1,0.36,1) ${index * 55}ms backwards`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 12, color: 'var(--ls-fg-muted)' }}>
            {badge ?? `#${hit.rank}`}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ls-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hit.video_title}
          </span>
        </div>
        <ScorePill score={hit.similarity_score} />
      </div>
      <div style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>
        {hit.chunk_id} · {hit.timestamp}
      </div>
      <ScoreBar score={hit.similarity_score} />
      <div style={{
        fontSize: 14, lineHeight: 1.7, color: 'var(--ls-fg)',
        unicodeBidi: 'plaintext', textAlign: 'start',
      }}>
        {text}
      </div>
      {hit.text.length > 180 && (
        <button onClick={() => setExpanded(e => !e)}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none',
                   color: 'var(--ls-blue)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                   padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {expanded ? 'Show less' : 'Show more'}
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
      )}
    </div>
  );
}

// Highlighting is intentionally English-only. Arabic tokens are skipped
// because (a) the bilingual corpus mixes English technical terms inside
// Arabic prose and the user has indicated Arabic highlights aren't
// useful, and (b) reliable Arabic stop-word filtering is corpus-specific
// and produced false positives. English-only highlighting still
// emphasises the technical terms that matter most in this corpus.
const STOP_WORDS_EN = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'here', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of',
  'on', 'or', 'our', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'to', 'too', 'us', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'whom', 'why', 'will', 'with', 'would',
  'you', 'your',
]);

const MIN_TOKEN_LENGTH = 3;
// Detects any character in the Arabic Unicode block (U+0600..U+06FF)
// or the Arabic Supplement / Extended-A blocks. A token containing
// even one Arabic glyph is treated as Arabic and skipped.
const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

function shouldHighlight(token) {
  if (token.length < MIN_TOKEN_LENGTH) return false;       // too short
  if (ARABIC_CHAR.test(token)) return false;                // Arabic — skip
  if (STOP_WORDS_EN.has(token.toLowerCase())) return false; // English stop word
  return true;
}

// Splits `text` around case-insensitive matches of meaningful English
// tokens from `query` and wraps each match in a highlighter span.
// Arabic tokens are deliberately not highlighted — only Latin-script
// content words like "DBMS", "entity", "modeling" trigger marks.
function highlight(text, query) {
  if (!query) return text;
  const tokens = query.split(/\s+/).filter(shouldHighlight);
  if (tokens.length === 0) return text;
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      return (
        <mark key={i} style={{
          background: 'var(--ls-highlight)', color: 'var(--ls-highlight-ink)',
          padding: '1px 3px', borderRadius: 3, fontWeight: 600,
        }}>{p}</mark>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

Object.assign(window, { ResultCard });
