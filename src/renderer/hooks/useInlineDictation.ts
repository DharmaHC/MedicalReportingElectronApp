/**
 * useInlineDictation.ts
 * Hook React per dettatura inline nell'editor.
 * Registra audio in continuo, invia chunk a Whisper ogni N secondi,
 * e restituisce il testo trascritto progressivamente.
 *
 * Approccio: ad ogni ciclo il MediaRecorder viene fermato (producendo un blob
 * WebM completo con header) e ricreato sullo stesso MediaStream.
 * Questo garantisce che ogni blob sia decodificabile indipendentemente.
 */

import { useState, useRef, useCallback } from 'react';
import { convertToWav } from '../utility/audioUtils';

// --------------- Tipi ---------------

export interface UseInlineDictationOptions {
  onTranscribed: (text: string) => void;
  onError: (error: string) => void;
  chunkIntervalMs?: number; // default 5000ms
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
  const { onTranscribed, onError, chunkIntervalMs = 5000 } = options;

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Callbacks in refs per evitare problemi di stale closures
  const onTranscribedRef = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
      if (chunksRef.current.length > 0) {
        const completeBlob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        chunksRef.current = [];
        // Accoda per trascrizione
        queueRef.current.push(completeBlob);
        processQueue();
      }

      // Se siamo ancora attivi, avvia un nuovo recorder
      if (activeRef.current && streamRef.current) {
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
   * Avvia la registrazione continua.
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

      queueRef.current = [];
      activeRef.current = true;

      // Avvia il primo recorder
      startNewRecorder();
      setIsListening(true);

      // Timer per ciclare il recorder ogni chunkIntervalMs
      intervalRef.current = setInterval(() => {
        cycleRecorder();
      }, chunkIntervalMs);

    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onErrorRef.current('Accesso al microfono negato. Verificare i permessi.');
      } else if (err.name === 'NotFoundError') {
        onErrorRef.current('Nessun microfono trovato.');
      } else {
        onErrorRef.current(`Errore microfono: ${err.message || err}`);
      }
    }
  }, [isListening, chunkIntervalMs, startNewRecorder, cycleRecorder]);

  /**
   * Ferma la registrazione e processa l'ultimo chunk.
   */
  const stop = useCallback(() => {
    if (!isListening) return;
    activeRef.current = false;

    // Ferma il timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Ferma il MediaRecorder corrente (triggera onstop → accoda ultimo blob)
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
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
