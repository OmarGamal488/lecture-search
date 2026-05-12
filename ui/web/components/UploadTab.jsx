const { useState, useRef } = React;

// File row tracks the upload + processing state for a single MP4.
function UploadTab() {
  const [rows, setRows] = useState([]); // [{ key, file, name, videoId?, error? }]
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const addFiles = async (newFiles) => {
    const items = Array.from(newFiles).map(f => ({
      key: Math.random().toString(36).slice(2),
      file: f, name: f.name, videoId: null, error: null,
    }));
    setRows(prev => [...prev, ...items]);
    // Upload each file sequentially so the server isn't slammed.
    for (const it of items) {
      try {
        const res = await LectureApi.upload(it.file);
        setRows(prev => prev.map(r => r.key === it.key ? { ...r, videoId: res.video_id } : r));
      } catch (e) {
        setRows(prev => prev.map(r => r.key === it.key ? { ...r, error: e.message } : r));
      }
    }
  };

  const onDrop = (e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${over ? 'var(--ls-blue)' : 'rgba(148,163,184,0.45)'}`,
          background: over ? 'rgba(67,56,202,0.04)' : 'var(--ls-bg-muted)',
          borderRadius: 14, padding: 36, textAlign: 'center', cursor: 'pointer',
          transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
        <Icon name="upload-cloud" size={36} color="var(--ls-fg-muted)" />
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ls-fg)' }}>
          Drop MP4s here, or click to browse
        </div>
        <div style={{ fontSize: 13, color: 'var(--ls-fg-muted)' }}>
          Each file runs through the 7-stage pipeline below.
        </div>
        <input ref={inputRef} type="file" multiple accept="video/mp4" style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)} />
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>Processing ({rows.length})</Eyebrow>
          {rows.map((row, i) => (
            <div key={row.key} style={{ animation: `lsFadeInUp 320ms cubic-bezier(0.22,1,0.36,1) ${i * 55}ms backwards` }}>
              {row.error ? (
                <div style={{ padding: 14, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 14, background: 'rgba(220,38,38,0.06)', color: '#991b1b', fontSize: 13 }}>
                  <strong style={{ fontFamily: 'var(--ls-font-mono)' }}>{row.name}</strong> — {row.error}
                </div>
              ) : row.videoId ? (
                <PipelineRow filename={row.name} videoId={row.videoId} />
              ) : (
                <div style={{ padding: 14, border: '1px solid var(--ls-border)', borderRadius: 14, background: 'var(--ls-bg-elev)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="upload" size={16} color="var(--ls-fg-muted)" />
                  <span style={{ fontFamily: 'var(--ls-font-mono)', fontSize: 13, color: 'var(--ls-fg)' }}>{row.name}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--ls-font-mono)', fontSize: 11, color: 'var(--ls-fg-muted)' }}>uploading…</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { UploadTab });
