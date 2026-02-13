/**
 * InlineDictationButton.tsx
 * Bottone toggle per dettatura inline nell'editor.
 * Click sinistro: start/stop dettatura inline (testo inserito progressivamente nel cursore).
 * Bottone secondario: apre DictationModal per dettatura con revisione.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { microphoneSolidIcon, stopIcon, volumeUpIcon } from '@progress/kendo-svg-icons';
import { Editor } from '@progress/kendo-react-editor';
import { useInlineDictation } from '../hooks/useInlineDictation';
import labels from '../utility/label';
import DictationModal from './DictationModal';
import './InlineDictationButton.css';

interface InlineDictationButtonProps {
  editorRef: React.RefObject<Editor | null>;
  enabled: boolean;
  onInsertText?: (text: string) => void;
  onDictationModalChange?: (visible: boolean) => void;
}

const InlineDictationButton: React.FC<InlineDictationButtonProps> = ({ editorRef, enabled, onInsertText, onDictationModalChange }) => {
  const [isDictationModalVisible, setIsDictationModalVisible] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  useEffect(() => {
    onDictationModalChange?.(isDictationModalVisible);
  }, [isDictationModalVisible, onDictationModalChange]);
  const lastTranscribedRef = useRef('');

  /**
   * Inserisce testo alla posizione corrente del cursore nell'editor,
   * aggiungendo uno spazio separatore se necessario.
   */
  const insertTextAtCursor = useCallback((text: string) => {
    if (onInsertText) {
      onInsertText(text);
      return;
    }
    const view = editorRef.current?.view;
    if (!view) return;

    const { from } = view.state.selection;
    const charBefore = from > 0 ? view.state.doc.textBetween(from - 1, from) : '';
    const needsSpace = charBefore.length > 0 && !/\s/.test(charBefore);
    const finalText = (needsSpace ? ' ' : '') + text;

    view.focus();
    view.dispatch(view.state.tr.insertText(finalText));
  }, [editorRef, onInsertText]);

  /**
   * Callback chiamata quando un chunk viene trascritto con successo.
   * Deduplica testo ripetuto ai bordi dei chunk.
   */
  const handleTranscribed = useCallback((text: string) => {
    const prev = lastTranscribedRef.current;

    // Deduplica: se il nuovo testo inizia con la fine del precedente
    let deduped = text;
    if (prev.length > 0) {
      const overlapLen = Math.min(prev.length, Math.floor(text.length / 2));
      for (let i = overlapLen; i >= 3; i--) {
        const prevEnd = prev.slice(-i).toLowerCase();
        const newStart = text.slice(0, i).toLowerCase();
        if (prevEnd === newStart) {
          deduped = text.slice(i);
          break;
        }
      }
    }

    if (deduped.trim().length > 0) {
      insertTextAtCursor(deduped.trim());
    }
    lastTranscribedRef.current = text;
  }, [insertTextAtCursor]);

  const handleError = useCallback((error: string) => {
    setErrorMsg(error);
    // Mostra errore per 4 secondi poi nascondi
    setTimeout(() => setErrorMsg(''), 4000);
  }, []);

  const { isListening, isProcessing, start, stop } = useInlineDictation({
    onTranscribed: handleTranscribed,
    onError: handleError,
    chunkIntervalMs: 1500,
  });

  const handleToggle = useCallback(async () => {
    if (isListening) {
      stop();
    } else {
      lastTranscribedRef.current = '';
      setErrorMsg('');
      await start();
    }
  }, [isListening, start, stop]);

  /**
   * Inserisce testo dal DictationModal nell'editor.
   */
  const handleDictationInsert = useCallback((text: string) => {
    if (onInsertText) {
      onInsertText(text);
    } else if (editorRef.current && editorRef.current.view) {
      const view = editorRef.current.view;
      view.focus();
      view.dispatch(view.state.tr.insertText(text));
    }
    setIsDictationModalVisible(false);
  }, [editorRef, onInsertText]);

  if (!enabled) return null;

  return (
    <>
      <div className="inline-dictation-wrapper">
        {/* Bottone principale: toggle dettatura inline */}
        <Button
          svgIcon={isListening ? stopIcon : microphoneSolidIcon}
          onClick={handleToggle}
          className={`inline-dictation-btn ${isListening ? 'listening' : ''}`}
          title={isListening ? labels.editorPage.stopDettatura : labels.editorPage.dettaturaInline}
        >
          {isListening ? labels.editorPage.stopDettatura : labels.editorPage.dettaturaInline}
        </Button>

        {/* Bottone secondario: apri modal dettatura con revisione */}
        {!isListening && (
          <Button
            svgIcon={volumeUpIcon}
            onClick={() => setIsDictationModalVisible(true)}
            className="inline-dictation-modal-btn"
            title={labels.editorPage.dettaturaModalCompleta}
            fillMode="flat"
            size="small"
          />
        )}

        {/* Indicatore processing */}
        {isProcessing && (
          <span className="inline-dictation-processing" title="Trascrizione in corso...">
            <span className="inline-dictation-spinner" />
          </span>
        )}

        {/* Indicatore listening */}
        {isListening && !isProcessing && (
          <span className="inline-dictation-listening-indicator" />
        )}

        {/* Errore inline */}
        {errorMsg && (
          <span className="inline-dictation-error" title={errorMsg}>
            {errorMsg}
          </span>
        )}
      </div>

      {/* Modal dettatura con revisione (esistente) */}
      <DictationModal
        visible={isDictationModalVisible}
        onClose={() => setIsDictationModalVisible(false)}
        onInsertText={handleDictationInsert}
      />
    </>
  );
};

export default InlineDictationButton;
