/**
 * useInlineDictation.ts
 * Hook React per dettatura inline nell'editor.
 * Registra audio in continuo, rileva pause vocali (VAD) per segmentare
 * i chunk, e invia ciascun chunk a Whisper per la trascrizione.
 *
 * Approccio VAD: un AnalyserNode della Web Audio API monitora il livello
 * RMS in tempo reale. Quando il livello scende sotto una soglia per un
 * tempo configurabile, il MediaRecorder viene ciclato producendo un blob
 * WebM completo che viene inviato a Whisper.
 *
 * Fallback: se l'utente parla senza pause, il recorder viene ciclato
 * comunque dopo maxChunkMs per evitare chunk troppo lunghi.
 */

import { useState, useRef, useCallback } from 'react';
import { convertToWav } from '../utility/audioUtils';

// --------------- Tipi ---------------

export interface UseInlineDictationOptions {
  onTranscribed: (text: string) => void;
  onError: (error: string) => void;
  /** Soglia RMS sotto la quale si considera silenzio (0.0-1.0). Default: 0.015 */
  silenceThreshold?: number;
  /** Durata minima del silenzio (ms) per triggerare il taglio del chunk. Default: 700 */
  silenceDurationMs?: number;
  /** Durata massima di un chunk (ms) come fallback. Default: 25000 */
  maxChunkMs?: number;
  /** Durata minima di un chunk (ms) per evitare micro-chunk. Default: 500 */
  minChunkMs?: number;
}

export interface UseInlineDictationReturn {
  isListening: boolean;
  isProcessing: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

// --------------- Hook ---------------

export function useInlineDictation(
  options: UseInlineDictationOptions
): UseInlineDictationReturn {
  const {
    onTranscribed,
    onError,
    silenceThreshold = 0.015,
    silenceDurationMs = 700,
    maxChunkMs = 25000,
    minChunkMs = 500,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // VAD refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const chunkStartRef = useRef<number>(0);
  const hasSpeechRef = useRef(false);

  // Callbacks in refs per evitare problemi di stale closures
  const onTranscribedRef = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Options in refs
  const silenceThresholdRef = useRef(silenceThreshold);
  silenceThresholdRef.current = silenceThreshold;
  const silenceDurationMsRef = useRef(silenceDurationMs);
  silenceDurationMsRef.current = silenceDurationMs;
  const maxChunkMsRef = useRef(maxChunkMs);
  maxChunkMsRef.current = maxChunkMs;
  const minChunkMsRef = useRef(minChunkMs);
  minChunkMsRef.current = minChunkMs;

  /**
   * Processa un blob audio completo: converte in WAV e invia a Whisper.
   */
  const processBlob = useCallback(async (blob: Blob) => {
    // Ignora blob troppo piccoli (< 2KB = probabilmente silenzio)
    if (blob.size < 2048) return;

    try {
      const wavBuffer = await convertToWav(blob);
      const result = await window.speechToText.transcribe(wavBuffer);

      if (result.success && result.text && result.text.trim().length > 0) {
        // Rimuovi annotazioni Whisper tra parentesi: [sattirazione], [musica], (applausi), ecc.
        const cleaned = result.text
          .replace(/\[.*?\]/g, '')
          .replace(/\(.*?\)/g, '')
          .trim();
        if (cleaned.length > 0) {
          onTranscribedRef.current(cleaned);
        }
      }
    } catch (err: any) {
      onErrorRef.current(`Errore trascrizione: ${err.message || err}`);
    }
  }, []);

  /**
   * Processa la coda di blob in ordine (uno alla volta).
   */
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    while (queueRef.current.length > 0) {
      const blob = queueRef.current.shift()!;
      await processBlob(blob);
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, [processBlob]);

  /**
   * Crea e avvia un nuovo MediaRecorder sullo stream esistente.
   */
  const startNewRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current) return;

    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      // Quando il recorder si ferma, i chunk accumulati formano un blob WebM completo
      if (chunksRef.current.length > 0 && hasSpeechRef.current) {
        const completeBlob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        chunksRef.current = [];
        // Accoda per trascrizione
        queueRef.current.push(completeBlob);
        processQueue();
      } else {
        chunksRef.current = [];
      }

      // Se siamo ancora attivi, avvia un nuovo recorder
      if (activeRef.current && streamRef.current) {
        hasSpeechRef.current = false;
        chunkStartRef.current = performance.now();
        startNewRecorder();
      }
    };

    recorderRef.current = recorder;
    // timeslice 250ms per granularità dati, ma il blob completo si forma solo allo stop()
    recorder.start(250);
  }, [processQueue]);

  /**
   * Cicla il MediaRecorder: ferma quello corrente (producendo un blob completo)
   * e il callback onstop ne avvierà uno nuovo.
   */
  const cycleRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop(); // Questo triggera onstop → accoda blob → startNewRecorder
    }
  }, []);

  /**
   * Calcola il livello RMS dall'AnalyserNode.
   */
  const getRmsLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;

    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sumSquares / dataArray.length);
  }, []);

  /**
   * Loop VAD: monitora livello audio e cicla il recorder quando rileva silenzio.
   */
  const vadLoop = useCallback(() => {
    if (!activeRef.current) return;

    const now = performance.now();
    const rms = getRmsLevel();
    const isSilent = rms < silenceThresholdRef.current;
    const chunkAge = now - chunkStartRef.current;

    if (!isSilent) {
      // Voce rilevata
      hasSpeechRef.current = true;
      silenceStartRef.current = 0;
    } else if (silenceStartRef.current === 0) {
      // Inizio silenzio
      silenceStartRef.current = now;
    }

    const silenceDuration = silenceStartRef.current > 0 ? now - silenceStartRef.current : 0;

    // Cicla se: (silenzio abbastanza lungo E chunk abbastanza vecchio E c'è stata voce)
    // OPPURE: chunk ha raggiunto durata massima
    const shouldCycle =
      (hasSpeechRef.current && silenceDuration >= silenceDurationMsRef.current && chunkAge >= minChunkMsRef.current) ||
      (chunkAge >= maxChunkMsRef.current);

    if (shouldCycle) {
      silenceStartRef.current = 0;
      cycleRecorder();
    }

    rafIdRef.current = requestAnimationFrame(vadLoop);
  }, [getRmsLevel, cycleRecorder]);

  /**
   * Avvia la registrazione continua con VAD.
   */
  const start = useCallback(async () => {
    if (isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mimeTypeRef.current = mimeType;

      // Setup Web Audio API per VAD
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      queueRef.current = [];
      activeRef.current = true;
      hasSpeechRef.current = false;
      silenceStartRef.current = 0;
      chunkStartRef.current = performance.now();

      // Avvia il primo recorder
      startNewRecorder();
      setIsListening(true);

      // Avvia il loop VAD
      rafIdRef.current = requestAnimationFrame(vadLoop);

    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onErrorRef.current('Accesso al microfono negato. Verificare i permessi.');
      } else if (err.name === 'NotFoundError') {
        onErrorRef.current('Nessun microfono trovato.');
      } else {
        onErrorRef.current(`Errore microfono: ${err.message || err}`);
      }
    }
  }, [isListening, startNewRecorder, vadLoop]);

  /**
   * Ferma la registrazione e processa l'ultimo chunk.
   */
  const stop = useCallback(() => {
    if (!isListening) return;
    activeRef.current = false;

    // Ferma il loop VAD
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }

    // Chiudi AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }

    // Ferma il MediaRecorder corrente (triggera onstop → accoda ultimo blob)
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      hasSpeechRef.current = true; // forza invio dell'ultimo chunk
      recorder.stop();
    }
    recorderRef.current = null;

    // Chiudi lo stream microfono
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsListening(false);
  }, [isListening]);

  return { isListening, isProcessing, start, stop };
}
