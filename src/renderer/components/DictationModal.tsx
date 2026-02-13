/**
 * DictationModal.tsx
 * Modal per dettatura vocale con Whisper locale.
 * Gestisce: verifica stato, download modello, registrazione audio,
 * trascrizione e inserimento testo nell'editor.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';
import labels from '../utility/label';
import { convertToWav } from '../utility/audioUtils';
import './DictationModal.css';

// --------------- Tipi ---------------

type DictationPhase =
  | 'checking'
  | 'setup-needed'
  | 'downloading'
  | 'ready'
  | 'recording'
  | 'transcribing'
  | 'result'
  | 'error';

interface DictationModalProps {
  visible: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

/**
 * Formatta secondi in mm:ss
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Formatta bytes in formato leggibile
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// --------------- Componente ---------------

const DictationModal: React.FC<DictationModalProps> = ({ visible, onClose, onInsertText }) => {
  const [phase, setPhase] = useState<DictationPhase>('checking');
  const [resultText, setResultText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
  const [transcriptionDuration, setTranscriptionDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Controlla lo stato del servizio all'apertura
  useEffect(() => {
    if (!visible) return;

    setPhase('checking');
    setResultText('');
    setErrorMessage('');
    setRecordingTime(0);
    setTranscriptionDuration(0);

    window.speechToText.getStatus().then((status) => {
      if (!status.enabled) {
        setPhase('error');
        setErrorMessage('La dettatura vocale non è abilitata nelle impostazioni.');
        return;
      }
      if (!status.binaryAvailable || !status.modelDownloaded) {
        // Binary e/o modello mancanti: mostra prompt download
        setPhase('setup-needed');
        return;
      }
      setPhase('ready');
    }).catch((err) => {
      setPhase('error');
      setErrorMessage(`Errore verifica stato: ${err.message || err}`);
    });
  }, [visible]);

  // Registra listener progress download
  useEffect(() => {
    if (phase !== 'downloading') return;

    window.speechToText.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    return () => {
      window.speechToText.removeDownloadProgressListener();
    };
  }, [phase]);

  // Cleanup al close
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const stopRecordingCleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // --------------- Azioni ---------------

  const handleDownloadModel = async () => {
    setPhase('downloading');
    setDownloadProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });

    try {
      const result = await window.speechToText.downloadModel();
      if (result.success) {
        setPhase('ready');
      } else {
        setPhase('error');
        setErrorMessage(result.error || 'Errore durante il download del modello');
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMessage(`Errore download: ${err.message || err}`);
    }
  };

  const handleStartRecording = async () => {
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

      audioChunksRef.current = [];

      // MediaRecorder: preferenza per webm/opus (supportato in Chromium/Electron)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Ferma il timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Chiudi lo stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          setPhase('error');
          setErrorMessage('Nessun audio registrato');
          return;
        }

        // Trascrizione
        setPhase('transcribing');
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        try {
          // Converti in WAV 16kHz mono
          const wavBuffer = await convertToWav(audioBlob);

          // Invia al main process per la trascrizione
          const result = await window.speechToText.transcribe(wavBuffer);

          if (result.success) {
            setTranscriptionDuration(result.durationMs || 0);
            // Rimuovi annotazioni Whisper tra parentesi: [sattirazione], [musica], ecc.
            const cleaned = (result.text || '')
              .replace(/\[.*?\]/g, '')
              .replace(/\(.*?\)/g, '')
              .trim();
            if (cleaned.length > 0) {
              setResultText(cleaned);
              setPhase('result');
            } else {
              setPhase('error');
              setErrorMessage(labels.editorPage.nessunaTrascrizioneRilevata);
            }
          } else {
            setPhase('error');
            setErrorMessage(result.error || labels.editorPage.erroreWhisper);
          }
        } catch (err: any) {
          setPhase('error');
          setErrorMessage(`Errore: ${err.message || err}`);
        }
      };

      // Avvia registrazione (chunk ogni 500ms)
      mediaRecorder.start(500);
      setRecordingTime(0);
      setPhase('recording');

      // Timer contatore
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

    } catch (err: any) {
      setPhase('error');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Accesso al microfono negato. Verificare i permessi nelle impostazioni di sistema.');
      } else if (err.name === 'NotFoundError') {
        setErrorMessage('Nessun microfono trovato. Collegare un microfono e riprovare.');
      } else {
        setErrorMessage(`${labels.editorPage.erroreRegistrazione}: ${err.message || err}`);
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleInsertText = () => {
    if (resultText.trim()) {
      onInsertText(resultText.trim());
    }
    handleClose();
  };

  const handleClose = () => {
    stopRecordingCleanup();
    setPhase('checking');
    setResultText('');
    setErrorMessage('');
    onClose();
  };

  const handleRetry = () => {
    setErrorMessage('');
    setResultText('');
    setPhase('ready');
  };

  // --------------- Render per fase ---------------

  if (!visible) return null;

  return (
    <Dialog
      title={labels.editorPage.dettaturaVocale}
      onClose={handleClose}
      width={500}
    >
      <div className="dictation-modal-content">

        {/* CHECKING */}
        {phase === 'checking' && (
          <>
            <div className="dictation-spinner" />
            <div className="dictation-status">Verifica componenti...</div>
          </>
        )}

        {/* SETUP NEEDED - Download modello */}
        {phase === 'setup-needed' && (
          <>
            <div className="dictation-model-info">
              <p>{labels.editorPage.modelloNonDisponibile}</p>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                Verranno scaricati i componenti necessari per il riconoscimento vocale.
                Il download richiede una connessione internet.
                Dopo il download, la dettatura funziona anche offline.
              </p>
            </div>
            <Button
              themeColor="primary"
              onClick={handleDownloadModel}
              style={{ minWidth: '200px' }}
            >
              {labels.editorPage.downloadModello}
            </Button>
          </>
        )}

        {/* DOWNLOADING */}
        {phase === 'downloading' && (
          <>
            <div className="dictation-status">{labels.editorPage.downloadInCorso}</div>
            <div className="dictation-progress-container">
              <div className="dictation-progress-bar">
                <div
                  className="dictation-progress-fill"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              <div className="dictation-progress-text">
                {downloadProgress.percent}%
                {downloadProgress.totalBytes > 0 && (
                  <> - {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}</>
                )}
              </div>
            </div>
          </>
        )}

        {/* READY */}
        {phase === 'ready' && (
          <>
            <div className="dictation-status">{labels.editorPage.prontoPerRegistrare}</div>
            <button
              className="dictation-record-btn"
              onClick={handleStartRecording}
              title={labels.editorPage.iniziaRegistrazione}
            >
              🎤
            </button>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Clicca per iniziare a dettare
            </div>
          </>
        )}

        {/* RECORDING */}
        {phase === 'recording' && (
          <>
            <div className="dictation-status recording">
              {labels.editorPage.registrazioneInCorso}
            </div>
            <div className="dictation-timer">{formatTime(recordingTime)}</div>
            <button
              className="dictation-record-btn recording"
              onClick={handleStopRecording}
              title={labels.editorPage.fermaRegistrazione}
            >
              ⏹
            </button>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Clicca per fermare la registrazione
            </div>
          </>
        )}

        {/* TRANSCRIBING */}
        {phase === 'transcribing' && (
          <>
            <div className="dictation-spinner" />
            <div className="dictation-status transcribing">
              {labels.editorPage.trascrizioneInCorso}
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Elaborazione audio in corso, attendere...
            </div>
          </>
        )}

        {/* RESULT */}
        {phase === 'result' && (
          <>
            <div className="dictation-status" style={{ color: '#2e7d32' }}>
              Trascrizione completata
            </div>
            <textarea
              className="dictation-result-textarea"
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              placeholder="Testo trascritto..."
            />
            {transcriptionDuration > 0 && (
              <div className="dictation-duration">
                Elaborazione: {(transcriptionDuration / 1000).toFixed(1)}s
              </div>
            )}
          </>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <>
            <div className="dictation-error">{errorMessage}</div>
          </>
        )}
      </div>

      <DialogActionsBar>
        {/* Pulsanti azione in base alla fase */}
        {phase === 'result' && (
          <>
            <Button onClick={handleRetry}>
              Registra di nuovo
            </Button>
            <Button themeColor="primary" onClick={handleInsertText}>
              {labels.editorPage.inserisciTesto}
            </Button>
          </>
        )}

        {phase === 'error' && (
          <>
            <Button onClick={handleClose}>Chiudi</Button>
            <Button themeColor="primary" onClick={handleRetry}>
              Riprova
            </Button>
          </>
        )}

        {(phase === 'ready' || phase === 'checking' || phase === 'setup-needed') && (
          <Button onClick={handleClose}>Chiudi</Button>
        )}

        {phase === 'recording' && (
          <Button onClick={handleClose}>
            {labels.editorPage.annulla}
          </Button>
        )}
      </DialogActionsBar>
    </Dialog>
  );
};

export default DictationModal;
