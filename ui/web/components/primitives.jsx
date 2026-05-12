// Small reusable primitives. All assigned to window at end.

const { useState, useEffect, useRef } = React;

function Icon({ name, size = 18, color, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const i = document.createElement('i');
      i.setAttribute('data-lucide', name);
      ref.current.appendChild(i);
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.75, width: size, height: size } });
    }
  }, [name, size]);
  return <span ref={ref} style={{ display: 'inline-flex', color, ...style }} />;
}

function Button({ variant = 'primary', icon, children, onClick, type = 'button', disabled }) {
  const base = {
    fontFamily: 'var(--ls-font-sans)', fontSize: 14, fontWeight: 600,
    padding: '9px 16px', borderRadius: 10, border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  };
  const variants = {
    primary:   { background: '#0f172a', color: '#fff', borderColor: '#0f172a' },
    accent:    { background: 'linear-gradient(90deg,#4338ca,#c026d3)', color: '#fff' },
    secondary: { background: '#fff', color: '#0f172a', borderColor: 'rgba(148,163,184,0.45)' },
    ghost:     { background: 'transparent', color: '#475569' },
    danger:    { background: '#fff', color: '#dc2626', borderColor: 'rgba(220,38,38,0.30)' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.95)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ls-fg-muted)', letterSpacing: '0.02em' }}>{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, onKeyDown }) {
  return (
    <input type="text" value={value} placeholder={placeholder} onKeyDown={onKeyDown}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: 'var(--ls-font-sans)', fontSize: 15, color: 'var(--ls-fg)',
        padding: '10px 12px', border: '1px solid rgba(148,163,184,0.45)',
        borderRadius: 10, background: '#fff', outline: 'none',
        transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onFocus={(e) => { e.target.style.borderColor = '#4338ca'; e.target.style.boxShadow = '0 0 0 3px rgba(67,56,202,0.25)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'rgba(148,163,184,0.45)'; e.target.style.boxShadow = 'none'; }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value} placeholder={placeholder} rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: 'var(--ls-font-sans)', fontSize: 15, color: 'var(--ls-fg)', lineHeight: 1.55,
        padding: '10px 12px', border: '1px solid rgba(148,163,184,0.45)',
        borderRadius: 10, background: '#fff', outline: 'none', resize: 'vertical',
        transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onFocus={(e) => { e.target.style.borderColor = '#4338ca'; e.target.style.boxShadow = '0 0 0 3px rgba(67,56,202,0.25)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'rgba(148,163,184,0.45)'; e.target.style.boxShadow = 'none'; }}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: 'var(--ls-font-sans)', fontSize: 15, color: 'var(--ls-fg)',
        padding: '10px 12px', border: '1px solid rgba(148,163,184,0.45)',
        borderRadius: 10, background: '#fff', outline: 'none',
      }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <span onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{
        width: 36, height: 20, borderRadius: 999, background: on ? '#4338ca' : '#94a3b8',
        position: 'relative', transition: '180ms',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2,
          width: 16, height: 16, borderRadius: 999, background: '#fff', transition: '180ms',
        }} />
      </span>
      {label && <span style={{ fontSize: 14, color: 'var(--ls-fg)' }}>{label}</span>}
    </span>
  );
}

function Slider({ value, onChange, min = 1, max = 10, step = 1 }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: 220, accentColor: '#4338ca' }} />
  );
}

function ScorePill({ score, size = 'sm' }) {
  // Hue interpolates 40 (amber) → 150 (emerald) over 0..1.
  const hue = 40 + (150 - 40) * Math.max(0, Math.min(1, score));
  const bg = `hsl(${hue}, 72%, 48%)`;
  const fs = size === 'lg' ? 13 : 11;
  return (
    <span style={{
      padding: size === 'lg' ? '4px 12px' : '3px 9px',
      borderRadius: 999, fontFamily: 'var(--ls-font-mono)',
      fontSize: fs, fontWeight: 700, color: '#fff', background: bg,
    }}>{score.toFixed(2)}</span>
  );
}

function ScoreBar({ score, animate = true }) {
  const [w, setW] = useState(animate ? 0 : score * 100);
  useEffect(() => {
    if (!animate) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setW(score * 100); return; }
    const t = requestAnimationFrame(() => setW(score * 100));
    return () => cancelAnimationFrame(t);
  }, [score, animate]);
  const hue = 40 + (150 - 40) * score;
  return (
    <div style={{ height: 6, background: 'var(--ls-bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${w}%`, background: `hsl(${hue}, 72%, 48%)`,
        borderRadius: 999, transition: 'width 650ms cubic-bezier(0.22, 1, 0.36, 1)',
      }} />
    </div>
  );
}

function Card({ children, style, onClick, hoverable = true }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hoverable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff', border: `1px solid ${hover ? 'rgba(67,56,202,0.45)' : 'rgba(148,163,184,0.25)'}`,
        borderRadius: 14, padding: 18,
        boxShadow: hover ? '0 10px 28px rgba(15,23,42,0.10)' : '0 1px 2px rgba(15,23,42,0.04)',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ls-fg-muted)' }}>{children}</span>;
}

Object.assign(window, { Icon, Button, Field, TextInput, Textarea, Select, Toggle, Slider, ScorePill, ScoreBar, Card, Eyebrow });
