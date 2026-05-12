// Real API client for the Lecture Search FastAPI backend. Shape mirrors
// the design kit's `FakeApi` so the visual components don't need to know
// where the data comes from. Everything here is async.
//
// Pipeline steps are defined here verbatim from the design kit so
// PipelineRow.jsx and CommandPalette.jsx (which import PIPELINE_STEPS via
// the window global) keep working unchanged.

const PIPELINE_STEPS = [
  { key: "extract_duration",    label: "duration",   icon: "clock" },
  { key: "extract_audio",       label: "audio",      icon: "audio-lines" },
  { key: "transcribe",          label: "transcribe", icon: "mic" },
  { key: "chunk_transcript",    label: "chunk",      icon: "scissors" },
  { key: "save_to_database",    label: "save",       icon: "database" },
  { key: "generate_embeddings", label: "embed",      icon: "vector-square" },
  { key: "finalize",            label: "finalize",   icon: "check" },
];

// Map each pipeline step name returned by the backend to its index, so
// the visualizer can advance even when only the step key is reported.
const STEP_INDEX = Object.fromEntries(PIPELINE_STEPS.map((s, i) => [s.key, i]));

function fmtTimestamp(start, end) {
  const f = (s) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };
  return `${f(start)} – ${f(end)}`;
}

const Api = {
  base: () => window.LS_API_BASE || `${window.location.origin}`,

  // ---- Generic helpers -------------------------------------------------
  async _json(path, opts = {}) {
    const res = await fetch(this.base() + path, opts);
    if (!res.ok) {
      let detail;
      try { detail = (await res.json()).detail; } catch { detail = await res.text(); }
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return res.json();
  },

  // ---- Health / sidebar ------------------------------------------------
  async health() { return this._json('/health'); },

  // ---- Videos ---------------------------------------------------------
  async listVideos() {
    const data = await this._json('/videos');
    // Backend already matches VideoInfo shape; surface as plain objects.
    return data.videos.map(v => ({
      id: v.id,
      filename: v.filename,
      title: v.title,
      duration: v.duration,
      upload_date: v.upload_date,
      processed: v.processed,
      num_chunks: v.num_chunks,
    }));
  },

  async deleteVideo(id) {
    return this._json(`/videos/${id}`, { method: 'DELETE' });
  },

  async videoDetails(id) { return this._json(`/videos/${id}`); },

  async videoStatus(id) { return this._json(`/videos/${id}/status`); },

  // Upload a single File object. Returns the {video_id, filename} on
  // success so the caller can start polling its status.
  async upload(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(this.base() + '/upload', { method: 'POST', body: form });
    if (!res.ok) {
      let detail;
      try { detail = (await res.json()).detail; } catch { detail = await res.text(); }
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return res.json();
  },

  // ---- Search ---------------------------------------------------------
  async search({ query, top_k = 5, video_id = null, use_mmr = true, score_threshold = null }) {
    const body = { query, top_k, use_mmr };
    if (video_id) body.video_id = Number(video_id);
    if (score_threshold !== null && score_threshold !== undefined) body.score_threshold = score_threshold;
    const data = await this._json('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (data.results || []).map(r => ({
      ...r,
      timestamp: r.timestamp || fmtTimestamp(r.start_time, r.end_time),
    }));
  },

  // ---- Ask (non-streaming) -------------------------------------------
  async ask({ question, top_k = 5, video_id = null, use_mmr = false }) {
    const body = { question, top_k, include_sources: true, use_mmr };
    if (video_id) body.video_id = Number(video_id);
    return this._json('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  // Streaming Ask. Calls onToken(text) for each chunk and onDone() at the
  // end. The /ask/stream endpoint returns plain text, not SSE, so we read
  // the body as a TextDecoder stream and split on whitespace to feed the
  // per-token fade-in. Sources are fetched separately because the stream
  // endpoint doesn't include them.
  streamAnswer({ question, top_k = 5, video_id = null }, onToken, onDone, onError) {
    const params = new URLSearchParams({ question, top_k: String(top_k) });
    if (video_id) params.set('video_id', String(video_id));
    const url = `${this.base()}/ask/stream?${params.toString()}`;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          // Emit complete whitespace-delimited tokens, keep trailing partial.
          const re = /(\S+\s+|\S+$)/g;
          let m;
          let lastIdx = 0;
          while ((m = re.exec(buf))) {
            // If we're at the end and didn't see trailing whitespace, hold.
            const isTail = re.lastIndex === buf.length && !/\s$/.test(m[0]);
            if (isTail) break;
            onToken(m[0]);
            lastIdx = re.lastIndex;
          }
          buf = buf.slice(lastIdx);
        }
        if (buf.length) onToken(buf);
        onDone();
      } catch (e) {
        if (e.name !== 'AbortError') onError?.(e);
      }
    })();

    return () => controller.abort();
  },

  // ---- Summarize ------------------------------------------------------
  async summarize(video_id, length) {
    const data = await this._json('/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: Number(video_id), length }),
    });
    return data.summary;
  },

  // ---- Stats ----------------------------------------------------------
  async stats() {
    const s = await this._json('/stats');
    return {
      total_videos: s.total_videos ?? 0,
      processed_videos: s.processed_videos ?? 0,
      total_chunks: s.total_chunks ?? s.vector_store_chunks ?? 0,
      database_size_mb: s.database_size_mb ?? 0,
      embedding_model: s.embedding_model ?? '—',
      llm_model: s.llm_model ?? '—',
      whisper_model: s.whisper_model ?? '—',
      framework: s.framework ?? '—',
    };
  },

  // Poll a video's processing status. Returns an unsubscribe fn. The
  // onTick callback receives `{step, progress, status, num_chunks?}` —
  // shape matches what the design's PipelineRow consumes.
  pollPipeline(videoId, onTick, onDone, onError) {
    let stopped = false;
    const interval = setInterval(async () => {
      if (stopped) return;
      try {
        const s = await this.videoStatus(videoId);
        onTick({
          step: s.step || s.status || 'pending',
          progress: s.progress ?? 0,
          status: s.status,
          num_chunks: s.num_chunks,
        });
        if (s.status === 'completed' || s.status === 'failed') {
          stopped = true;
          clearInterval(interval);
          onDone?.(s);
        }
      } catch (e) {
        stopped = true;
        clearInterval(interval);
        onError?.(e);
      }
    }, 1500);
    return () => { stopped = true; clearInterval(interval); };
  },

  STEP_INDEX,
};

window.LectureApi = Api;
window.PIPELINE_STEPS = PIPELINE_STEPS;
