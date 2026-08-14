// ===== Microphone capture for voice logging =====
//
// Records via `MediaRecorder` (whatever codec/rate the browser gives it —
// typically 44.1/48kHz), then decodes and resamples to mono 16kHz, the rate
// `lib/speech.ts`'s Whisper pipeline actually expects. Real Web Audio API
// code (`AudioContext`/`OfflineAudioContext`/`MediaRecorder`), so this can't
// run in this project's `node`-environment test suite — verified live in the
// browser instead, same as `lib/embeddings.ts`'s model-loading path.

export interface VoiceRecorder {
  /** Requests mic permission (prompts the browser's own permission UI on
   *  first use) and starts capturing. Throws if permission is denied. */
  start(): Promise<void>
  /** Stops capturing and resolves with mono 16kHz audio, ready for
   *  `transcribeAudio`. */
  stop(): Promise<Float32Array>
  /** Stops capturing without producing audio — used when a coach starts a
   *  recording and then decides not to log it. */
  cancel(): void
}

const TARGET_SAMPLE_RATE = 16000

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    void audioCtx.close()
  }

  if (decoded.sampleRate === TARGET_SAMPLE_RATE && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0)
  }

  // OfflineAudioContext resamples AND downmixes to mono in one pass — a
  // multi-channel source connected to a 1-channel destination downmixes per
  // the Web Audio spec, so no separate stereo-to-mono step is needed.
  const frames = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE)
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

export function createVoiceRecorder(): VoiceRecorder {
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []

  function teardownStream() {
    stream?.getTracks().forEach(t => t.stop())
    stream = null
  }

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks = []
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.start()
    },

    stop() {
      return new Promise<Float32Array>((resolve, reject) => {
        if (!recorder) { reject(new Error('Not recording.')); return }
        const mimeType = recorder.mimeType
        recorder.onstop = () => {
          teardownStream()
          const blob = new Blob(chunks, { type: mimeType })
          decodeToMono16k(blob).then(resolve, reject)
        }
        recorder.stop()
      })
    },

    cancel() {
      try { recorder?.stop() } catch { /* already stopped */ }
      teardownStream()
    },
  }
}
