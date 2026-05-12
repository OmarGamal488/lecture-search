// PipelineRow — 7-stage visualizer for one uploaded video.
//
// Visual structure (stages, gradient, badges, animations) is identical to
// the design kit; the only change vs Design/ui_kits/.../PipelineRow.jsx is
// that the data source is the real `/videos/{id}/status` poll instead of
// `FakeApi.fakePipelineRun`.

const { useState, useEffect } = React;

function PipelineRow({ filename, videoId, onComplete }) {
  const [tick, setTick] = useState({ step: PIPELINE_STEPS[0].key, progress: 0, status: 'queued' });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(null);
  const [numChunks, setNumChunks] = useState(null);
  // Time we entered the current stage — re-rendered every 500 ms so the
  // user sees the seconds tick during the long transcribe pause.
  const [stageStart, setStageStart] = useState(() => Date.now());
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!videoId) return;
    let lastStep = null;
    const stop = LectureApi.pollPipeline(
      videoId,
      (t) => {
        // Reset the per-stage stopwatch whenever the step changes — the
        // user-visible "stage Xs" counter resets at each boundary.
        if (t.step !== lastStep) { lastStep = t.step; setStageStart(Date.now()); }
        setTick(t);
      },
      (final) => {
        if (final.status === 'completed') {
          setDone(true);
          setNumChunks(final.num_chunks ?? null);
          onComplete && onComplete(final);
        } else if (final.status === 'failed') {
          setFailed(true);
          setError(final.message || 'Processing failed');
        }
      },
      (e) => { setFailed(true); setError(e.message); }
    );
    return stop;
  }, [videoId]);

  // Drive the elapsed-time display so transcribe doesn't look frozen.
  useEffect(() => {
    if (done || failed) return;
    const h = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(h);
  }, [done, failed]);

  // Backend semantics: `step` is the node that has *just completed* (the
  // graph calls back from `for state_update in graph.stream(...)` only
  // after each node returns). So if step=transcribe, transcribe is done
  // and chunk_transcript is now running. The visualizer's "active" stage
  // is therefore `lastCompletedIdx + 1`. Initial sentinels like
  // "initializing" / "queued" have no entry in STEP_INDEX → they leave
  // stage 0 active and the rest pending.
  const stepKey = tick.step;
  const idxFromKey = LectureApi.STEP_INDEX[stepKey];
  let currentIdx;
  if (done) currentIdx = PIPELINE_STEPS.length;
  else if (failed) currentIdx = Math.max(0, idxFromKey ?? 0);
  else if (idxFromKey == null) currentIdx = 0; // pre-first-tick sentinel
  else currentIdx = Math.min(PIPELINE_STEPS.length, idxFromKey + 1);

  // Label the *currently running* stage, not the last one to finish. The
  // backend can only report stage boundaries (it doesn't see inside a
  // Whisper transcription run), so showing the just-completed step's %
  // would freeze on "extract_audio · 29%" for the whole transcribe pause
  // and make the user think the pipeline died.
  const activeStage = PIPELINE_STEPS[currentIdx];
  const stagePos = `${Math.min(currentIdx + 1, PIPELINE_STEPS.length)}/${PIPELINE_STEPS.length}`;
  const elapsedSec = Math.max(0, Math.floor((nowTs - stageStart) / 1000));
  const statusLabel = failed
    ? 'failed'
    : done
      ? (numChunks != null ? `completed · ${numChunks} chunks` : 'completed')
      : tick.status === 'queued'
        ? 'queued…'
        : activeStage
          ? `${activeStage.key}… · stage ${stagePos} · ${elapsedSec}s`
          : 'starting…';

  return (
    <div style={{
      background: 'var(--ls-bg-elev)', border: `1px solid ${failed ? 'rgba(220,38,38,0.30)' : 'var(--ls-border)'}`,
      borderRadius: 14, padding: 16,
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="film" size={16} color="var(--ls-fg-muted)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ls-fg)', fontFamily: 'var(--ls-font-mono)' }}>{filename}</span>
        </div>
        <span style={{
          fontFamily: 'var(--ls-font-mono)', fontSize: 11,
          color: failed ? 'var(--ls-red)' : done ? 'hsl(150,70%,40%)' : 'var(--ls-fg-muted)',
        }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {PIPELINE_STEPS.map((step, i) => {
          let state;
          if (failed && i === currentIdx) state = 'failed';
          else if (i < currentIdx) state = 'done';
          else if (i === currentIdx && !failed) state = 'active';
          else state = 'pending';
          return (
            <React.Fragment key={step.key}>
              <Stage step={step} state={state} />
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2,
                  background: i < currentIdx ? 'hsl(150,70%,55%)' : 'var(--ls-bg-muted)',
                  transition: 'background 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ls-red)', fontFamily: 'var(--ls-font-mono)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Stage({ step, state }) {
  let bg = 'var(--ls-bg-muted)', color = 'var(--ls-fg-muted)', animation = 'none';
  if (state === 'done')   { bg = 'rgba(34,197,94,0.16)'; color = 'hsl(150,70%,38%)'; }
  if (state === 'active') { bg = 'linear-gradient(90deg,#4338ca,#c026d3,#f59e0b)'; color = '#fff'; animation = 'lsActivePulse 1.8s ease-in-out infinite'; }
  if (state === 'failed') { bg = 'rgba(220,38,38,0.16)'; color = 'var(--ls-red)'; }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 70 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 999, background: bg, backgroundSize: '200% 100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        animation,
      }}>
        <Icon name={state === 'done' ? 'check' : state === 'failed' ? 'triangle-alert' : step.icon} size={16} color={color} />
      </div>
      <div style={{ fontSize: 10, fontFamily: 'var(--ls-font-mono)', color: 'var(--ls-fg-muted)' }}>{step.label}</div>
    </div>
  );
}

// Inject shared keyframes once (same set as the design kit).
if (typeof document !== 'undefined' && !document.getElementById('ls-pipeline-keyframes')) {
  const s = document.createElement('style');
  s.id = 'ls-pipeline-keyframes';
  s.textContent = `
    @keyframes lsActivePulse {
      0%, 100% { background-position: 0% 50%; box-shadow: 0 0 0 0 rgba(192,38,211,0.45); }
      50% { background-position: 100% 50%; box-shadow: 0 0 0 6px rgba(192,38,211,0); }
    }
    @keyframes lsFadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes lsCaretBlink { 50% { opacity: 0; } }
    @keyframes lsTokenIn {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes lsPendingPulse {
      0%, 100% { opacity: 0.55; }
      50% { opacity: 1; }
    }
    @keyframes lsShimmer {
      0% { background-position: -100% 0; }
      100% { background-position: 200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { PipelineRow });
