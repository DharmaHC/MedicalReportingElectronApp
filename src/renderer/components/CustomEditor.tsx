import React, { useRef, useEffect, useState, useMemo, forwardRef, useCallback } from 'react';
import { Editor, EditorProps, EditorTools, EditorMountEvent, ProseMirror } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';

// Usa TextSelection da ProseMirror esposto da Kendo per compatibilità v9
const { TextSelection, Plugin, PluginKey, Decoration, DecorationSet } = ProseMirror;

const ZOOM_STORAGE_KEY = 'medreport_editor_zoom';

const ZoomControls: React.FC<{ zoomLevel: number; setZoomLevel: (n: number) => void; }> = ({ zoomLevel, setZoomLevel }) => {
  const [inputValue, setInputValue] = useState(Math.round(zoomLevel * 100).toString());
  useEffect(() => { setInputValue(Math.round(zoomLevel * 100).toString()); }, [zoomLevel]);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyNumbers = e.target.value.replace(/\D/g, '');
    setInputValue(onlyNumbers);
  };
  const applyInputValue = () => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 50 && val <= 200) setZoomLevel(val / 100);
    else setInputValue(Math.round(zoomLevel * 100).toString());
  };
  return (
    <ToolbarItem>
      <div style={{
        display: 'flex', alignItems: 'center', background: '#f6f8fa', borderRadius: 6, padding: '2px 8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)', gap: 2, minHeight: 32
      }}>
        <Button svgIcon={minusIcon} onClick={() => setZoomLevel(Math.max(zoomLevel - 0.1, 0.5))} title="Zoom Out" style={{ minWidth: 32 }} />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={applyInputValue}
          onKeyDown={e => { if (e.key === 'Enter') { applyInputValue(); (e.target as HTMLInputElement).blur(); } }}
          style={{
            width: 50, textAlign: 'center', border: '1px solid #ddd', background: '#fff', borderRadius: 4,
            margin: '0 6px', fontWeight: 'bold', height: 28
          }}
          maxLength={3}
        />%
        <Button svgIcon={plusIcon} onClick={() => setZoomLevel(Math.min(zoomLevel + 0.1, 2))} title="Zoom In" style={{ minWidth: 32 }} />
      </div>
    </ToolbarItem>
  );
};

interface CustomEditorProps extends EditorProps {
  bodyWidthPt?: number; // Larghezza body del template RTF in pt (dal server)
  bodyHeightPt?: number; // Altezza body del template RTF in pt (dal server)
  lineSpacing?: number; // Line-spacing moltiplicatore (es. 1.25 per \sl300\slmult1)
  spacingAfterPt?: number; // Space-after per paragrafo in pt (es. 9 per \sa180)
}

const CustomEditor = forwardRef<Editor, CustomEditorProps>((props, ref) => {
  const { bodyWidthPt, bodyHeightPt, lineSpacing, spacingAfterPt, ...editorProps } = props;
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const stored = sessionStorage.getItem(ZOOM_STORAGE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val >= 0.5 && val <= 2) return val;
    }
    return 1.0;
  });

  const editorBoxRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<any>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);

  const highlightActiveRef = useRef<boolean>(false);

  useEffect(() => {
    window.appSettings.get().then(settings => {
      const shouldHighlight = settings.highlightPlaceholder ?? false;
      highlightActiveRef.current = shouldHighlight;
      // Forza ProseMirror a ricalcolare le decorazioni quando le impostazioni sono pronte
      if (editorViewRef.current && shouldHighlight) {
        editorViewRef.current.dispatch(editorViewRef.current.state.tr);
      }
    });
  }, []);

  // Plugin ProseMirror per evidenziare i segnaposto # tramite decorazioni (non DOM diretto)
  const hashHighlightPlugin = useMemo(() => {
    const key = new PluginKey('hashHighlight');
    return new Plugin({
      key,
      props: {
        decorations(state: any) {
          if (!highlightActiveRef.current) return DecorationSet.empty;
          const decos: any[] = [];
          state.doc.descendants((node: any, pos: number) => {
            if (node.isText && node.text) {
              let idx = 0;
              while ((idx = node.text.indexOf('#', idx)) !== -1) {
                decos.push(
                  Decoration.inline(pos + idx, pos + idx + 1, {
                    class: '__hash-highlight',
                    style: 'background-color: yellow; color: black; padding: 0 2px;',
                  })
                );
                idx++;
              }
            }
            return true;
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


const renderPageBreaks = useCallback(() => {
  const editorBox = editorBoxRef.current;
  if (!editorBox) return;

      editorBox.style.height = '100%';

      const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
  if (!content) return;
  const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
  if (!proseMirror) return;

  // Altezza body dal template RTF (pt → px: 1pt = 96/72 px a schermo)
  // Default 697.9pt ≈ A4 (841.89pt) meno 72pt margine sopra e sotto
  const heightPt = bodyHeightPt && bodyHeightPt > 0 ? bodyHeightPt : 697.9;

  // Compensazione dinamica: nel PDF ogni paragrafo aggiunge \sa (space-after)
  // e il line-height può essere > 100%. L'editor HTML non li applica, quindi
  // contiamo i paragrafi visibili e stimiamo lo spazio aggiuntivo per pagina.
  const saPt = spacingAfterPt && spacingAfterPt > 0 ? spacingAfterPt : 0;
  const lsMult = lineSpacing && lineSpacing > 0 ? lineSpacing : 1;

  // Stima paragrafi per pagina: altezza pagina / (altezza riga media * lineSpacing + spaceAfter)
  // Font 12pt ≈ 16px di altezza riga base
  const avgLineHeightPt = 12 * lsMult;
  const avgLinesPerPara = 2; // stima media: 2 righe per paragrafo
  const paraHeightPt = avgLineHeightPt * avgLinesPerPara + saPt;
  const parasPerPage = paraHeightPt > 0 ? Math.floor(heightPt / paraHeightPt) : 0;

  // Compensazione totale: differenza tra line-height PDF e editor (CSS line-height 1.25 = 125%)
  const cssLineHeight = 1.25; // forzato dal CSS EditorPage.css
  const lhDiffPerLine = 12 * (lsMult - cssLineHeight); // differenza pt per riga
  const lhCompensation = lhDiffPerLine * avgLinesPerPara * parasPerPage;

  // Space-after: nel PDF aggiunge saPt per paragrafo, nell'editor margin-bottom è 0
  const saCompensation = saPt * parasPerPage;

  const totalCompensation = saCompensation + lhCompensation - 6; // -6pt: calibrazione fine (≈ mezza riga)
  const adjustedHeightPt = heightPt - totalCompensation;
  const pageHeightPx = adjustedHeightPt * (96 / 72);

  // Rimuovi eventuale style iniettato dalla versione precedente
  const oldStyle = document.getElementById("prosemirror-paragraph-spacing");
  if (oldStyle) oldStyle.remove();


  // Mostra i page break fino alla fine del contenuto o dell'area visibile,
  // ma senza forzare minPages che causerebbe scrollbar artificiale.
  const contentHeight = proseMirror.scrollHeight;
  const visibleHeight = (content.clientHeight || 0) / zoomLevel;
  const totalHeight = Math.max(contentHeight, visibleHeight);
  const overlayClass = "page-break-overlay-layer";

  let overlay = proseMirror.querySelector(`.${overlayClass}`) as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = overlayClass;
    proseMirror.appendChild(overlay);
  }

  // Pulizia precedenti marker
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

  for (let y = pageHeightPx; y < totalHeight; y += pageHeightPx) {
    const marker = document.createElement("div");
    marker.className = "auto-page-break";
    marker.style.position = "absolute";
    marker.style.top = `${y}px`;
    marker.style.width = "100%";
    marker.style.pointerEvents = "none";
    marker.style.zIndex = "20";
    marker.style.borderTop = "1.2pt dashed #ff0000";
    overlay.appendChild(marker);
  }

  // Apply scale & margin
  // La larghezza deve corrispondere al body del template RTF per avere
  // lo stesso word-wrap dell'anteprima PDF.
  // Con content-box, width = area testo; il padding è fuori.
  const editorWidthPt = bodyWidthPt && bodyWidthPt > 0 ? bodyWidthPt : 428;
  proseMirror.style.transform = `scale(${zoomLevel})`;
    proseMirror.style.marginLeft = '100pt';
    proseMirror.style.overflowX = 'hidden';
    proseMirror.style.transformOrigin = "top left";
    proseMirror.style.height = `${100 / zoomLevel}%`;

    // Imposta la larghezza compensando eventuale scrollbar verticale.
    // Cerca scrollbar su ProseMirror e sui suoi antenati fino a k-editor-content.
    let el: HTMLElement | null = proseMirror;
    let scrollbarW = 0;
    while (el && !el.classList.contains('k-editor-content')) {
      const sw = el.offsetWidth - el.clientWidth;
      if (sw > scrollbarW) scrollbarW = sw;
      el = el.parentElement;
    }
    proseMirror.style.width = scrollbarW > 0
      ? `calc(${editorWidthPt}pt + ${scrollbarW}px)`
      : `${editorWidthPt}pt`;
}, [zoomLevel, bodyHeightPt, bodyWidthPt, lineSpacing, spacingAfterPt]);

  useEffect(() => { sessionStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel)); }, [zoomLevel]);

  useEffect(() => {
    const editorBox = editorBoxRef.current;
    if (!editorBox) return;
    const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
    if (!content) return;
    const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
    if (!proseMirror) return;

    renderPageBreaks();

    // Disconnetti l'observer precedente se esiste (evita memory leak da observer multipli)
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }

    const observer = new MutationObserver((mutations) => {
      const overlay = proseMirror.querySelector('.page-break-overlay-layer');
      if (
        mutations.some(m =>
          (overlay && (m.target === overlay || overlay.contains(m.target as Node)))
        )
      ) {
        return;
      }

      renderPageBreaks();
    });

    // Salva il riferimento per cleanup
    mutationObserverRef.current = observer;
    observer.observe(proseMirror, { childList: true, subtree: true, characterData: true });

    window.addEventListener('resize', renderPageBreaks);

    return () => {
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      }
      window.removeEventListener('resize', renderPageBreaks);
      let overlay = proseMirror.querySelector('.page-break-overlay-layer') as HTMLElement | null;
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    // eslint-disable-next-line
  }, [props.defaultContent, zoomLevel, renderPageBreaks]);


  // Gestione del menu contestuale
  useEffect(() => {
    const editorElement = editorBoxRef.current;

    if (!editorElement) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // blocca il menu di default
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send('show-context-menu');
      }
    };

    editorElement.addEventListener('contextmenu', handleContextMenu);
    return () => editorElement.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Ref per tracciare l'ultima selezione di #
  const lastHashPosRef = useRef<number | null>(null); // tiene traccia dell'ultima selezione

  // Gestione tasto F3 per selezionare il primo #
useEffect(() => {

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'F3') return;

    e.preventDefault();
    e.stopPropagation();

    const view = editorViewRef.current;
    if (!view || !view.state) return;

    const { state } = view;
    const { doc, selection } = state;
    const cursorPos = selection.from;

    const hashes: number[] = [];

    // Trova tutte le posizioni assolute dei caratteri '#'
    doc.descendants((node: any, nodePos: number) => {
      if (node.isText && node.text) {
        let idx = -1;
        let offset = 0;
        while ((idx = node.text.indexOf('#', offset)) !== -1) {
          hashes.push(nodePos + idx);
          offset = idx + 1;
        }
      }
      return true;
    });

    if (hashes.length === 0) return;

    // Trova il prossimo hash dopo il cursore (o dopo l'ultimo visitato)
    const current = lastHashPosRef.current;
    const next = hashes.find(pos => (current !== null ? pos > current : pos > cursorPos));

    const targetPos = next !== undefined ? next : hashes[0]; // wrap-around
    lastHashPosRef.current = targetPos;

    // Crea la transazione con la nuova selezione
    const tr = state.tr.setSelection(
      TextSelection.create(doc, targetPos, targetPos + 1)
    ).scrollIntoView();

    // Dispatch della transazione
    view.dispatch(tr);

    // Focus usando requestAnimationFrame per sincronizzarsi con Kendo v9
    requestAnimationFrame(() => {
      view.focus();
    });
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);



  const handleEditorChange = (event: any, value?: any) => {
    setTimeout(() => {
      renderPageBreaks();
    }, 0);
    if (props.onChange) props.onChange(event);
  };

  const defaultTools = [
    [
      EditorTools.Bold, EditorTools.Italic, EditorTools.Underline, EditorTools.Strikethrough,
      EditorTools.Subscript, EditorTools.Superscript,
      EditorTools.ForeColor, EditorTools.BackColor, EditorTools.CleanFormatting,
    ],
    [
      EditorTools.AlignLeft, EditorTools.AlignCenter, EditorTools.AlignRight, EditorTools.AlignJustify,
      EditorTools.Indent, EditorTools.Outdent,
    ],
    [
      EditorTools.OrderedList, EditorTools.UnorderedList,
    ],
    [
      EditorTools.Undo, EditorTools.Redo, EditorTools.ViewHtml,
    ]
  ];
  const tools = [
    ...(props.tools ? props.tools : defaultTools),
    [
      () => <ZoomControls zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} />
    ]
  ];

  // Callback onMount per catturare l'EditorView correttamente (Kendo v9)
  const handleMount = (event: EditorMountEvent) => {
    // Inietta il plugin decorativo per l'evidenziazione dei segnaposto #
    // (deve avvenire prima di props.onMount che può aggiungere altri plugin via reconfigure)
    const currentState = event.viewProps.state;
    event.viewProps.state = currentState.reconfigure({
      plugins: [...currentState.plugins, hashHighlightPlugin],
    });

    // Salva il riferimento all'EditorView
    editorViewRef.current = event.viewProps.view;

    // Chiama onMount del parent se presente
    if (props.onMount) {
      return props.onMount(event);
    }
    return undefined;
  };

  return (
    <div ref={editorBoxRef}>
      <Editor
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as any).current = node;
          // Fallback per retrocompatibilità
          if (!editorViewRef.current && node?.view) {
            editorViewRef.current = node.view;
          }
        }}
        {...editorProps}
        tools={tools}
        defaultEditMode="div"
        onChange={handleEditorChange}
        onMount={handleMount}
      />
    </div>
  );
});

export default CustomEditor;
