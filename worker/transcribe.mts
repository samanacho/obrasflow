// Transcripción de notas de voz de WhatsApp, 100% en esta PC (Whisper con
// @huggingface/transformers). No usa servicios pagos ni manda el audio a
// ningún lado: el modelo se baja una sola vez a .local-models/ (git lo
// ignora) y después funciona sin internet.
//
// WhatsApp manda las notas de voz en OGG/Opus a 48 kHz; Whisper espera mono
// a 16 kHz, así que se decodifica (WASM, sin ffmpeg) y se baja 3:1.

import { resolve } from "path";

const MODEL = process.env.WHISPER_MODEL?.trim() || "onnx-community/whisper-small";
/** Notas más largas no se transcriben (en CPU tardaría demasiado). */
export const MAX_AUDIO_SECONDS = 180;

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let asr: Promise<Asr> | null = null;

function loadModel(): Promise<Asr> {
  if (!asr) {
    asr = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = resolve(process.cwd(), ".local-models");
      const t0 = Date.now();
      const p = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", device: "cpu" });
      console.log(`🎤 Modelo de voz listo (${MODEL}, ${Math.round((Date.now() - t0) / 1000)} s).`);
      return p as unknown as Asr;
    })().catch((err) => {
      asr = null; // se reintenta en el próximo audio
      throw err;
    });
  }
  return asr;
}

/** Precarga el modelo en segundo plano (la primera vez lo descarga, ~250 MB). */
export function warmUpTranscriber() {
  loadModel().catch((err) => console.error("🎤 No se pudo cargar el modelo de voz:", (err as Error).message));
}

async function decodeOgg(data: Buffer): Promise<Float32Array> {
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    const out = await decoder.decodeFile(new Uint8Array(data));
    const chans = out.channelData;
    const n = out.samplesDecoded;
    // Mono + 48 kHz -> 16 kHz (promedio de 3 muestras: también filtra un poco).
    const mono = new Float32Array(Math.floor(n / 3));
    for (let i = 0; i < mono.length; i++) {
      let s = 0;
      for (const c of chans) s += c[i * 3] + c[i * 3 + 1] + c[i * 3 + 2];
      mono[i] = s / (3 * chans.length);
    }
    return mono;
  } finally {
    decoder.free();
  }
}

/** Texto de la nota de voz ("" si no se entendió nada). */
export async function transcribeVoiceNote(data: Buffer): Promise<{ text: string; seconds: number }> {
  const audio = await decodeOgg(data);
  const seconds = Math.round(audio.length / 16000);
  if (seconds > MAX_AUDIO_SECONDS) throw Object.assign(new Error("audio demasiado largo"), { tooLong: seconds });
  const model = await loadModel();
  const t0 = Date.now();
  const r = await model(audio, { language: "spanish", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  const text = (Array.isArray(r) ? r.map((x) => x.text).join(" ") : r.text).replace(/\s+/g, " ").trim();
  console.log(`🎤 Nota de voz de ${seconds} s transcripta en ${Math.round((Date.now() - t0) / 100) / 10} s.`);
  return { text, seconds };
}
