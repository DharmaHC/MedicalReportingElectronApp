/**
 * audioUtils.ts
 * Funzioni di conversione audio condivise tra DictationModal e dettatura inline.
 * Converte audio WebM/Opus in WAV 16-bit PCM 16kHz mono (formato richiesto da whisper.cpp).
 */

/**
 * Converte un Blob audio (WebM/Opus) in ArrayBuffer WAV 16-bit PCM 16kHz mono.
 */
export async function convertToWav(audioBlob: Blob): Promise<ArrayBuffer> {
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Decodifica il blob audio con Web Audio API
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  // Resample a 16kHz mono usando OfflineAudioContext
  const targetSampleRate = 16000;
  const numSamples = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, numSamples, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const renderedBuffer = await offlineCtx.startRendering();

  // Codifica come WAV PCM 16-bit
  return encodeWav(renderedBuffer);
}

/**
 * Scrive un AudioBuffer come WAV PCM 16-bit con header standard 44 bytes.
 */
export function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const samples = audioBuffer.getChannelData(0);
  const dataSize = samples.length * (bitDepth / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                                     // chunk size
  view.setUint16(20, 1, true);                                       // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitDepth / 8), true);             // block align
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples (float32 -> int16)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
