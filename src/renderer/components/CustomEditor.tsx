import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import { Editor, EditorProps, EditorTools, EditorMountEvent, ProseMirror } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';

// Usa TextSelection da ProseMirror esposto da Kendo per compatibilità v9
const { TextSelection } = ProseMirror;

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

const CustomEditor = forwardRef<Editor, EditorProps>((props, ref) => {
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

  const [useHighlight, setUseHighlight] = useState<boolean>(false);
  const [rowsPerPage, setReportrowsPerPage] = useState<number>(30);

  useEffect(() => {
      // Accedi ai settings globali esposti dal preload
      window.appSettings.get().then(settings => {
        setUseHighlight(settings.highlightPlaceholder ?? false);
        setReportrowsPerPage(settings.rowsPerPage ?? 30);
      });
    }, []);


const renderPageBreaks = useCallback(() => {
  const editorBox = editorBoxRef.current;
  if (!editorBox) return;

      editorBox.style.height = '100%';

      const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
  if (!content) return;
  const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
  if (!proseMirror) return;

  // Calcolo altezza riga da un <p>
  const sampleParagraph = proseMirror.querySelector('p');
  if (!sampleParagraph) return;
  const lineHeight = parseFloat(window.getComputedStyle(sampleParagraph).lineHeight || "20") || 20;

  const totalHeight = proseMirror.scrollHeight;
  const pageHeightPx = lineHeight * rowsPerPage; // rows per page configurabili
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
  proseMirror.style.transform = `scale(${zoomLevel})`;
    proseMirror.style.width = '428pt';
    proseMirror.style.marginLeft = '100pt';
    proseMirror.style.overflowX = 'hidden';
    proseMirror.style.transformOrigin = "top left";
    proseMirror.style.height = `${100 / zoomLevel}%`;
}, [zoomLevel, rowsPerPage]);

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
      if (useHighlight) {
        // Evita loop disconnettendo temporaneamente l'observer
        observer.disconnect();
        highlightHashes();
        // Ricollega l'observer
        observer.observe(proseMirror, { childList: true, subtree: true, characterData: true });
      }
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



  // Evidenziazione degli # nel testo
  const highlightHashes = () => {
    const content = editorBoxRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
    if (!content) return;

    // Pulisce eventuali highlight esistenti
    const oldSpans = content.querySelectorAll('span.__hash-highlight');
    oldSpans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent || ''), span);
    });

    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
    const nodes: Text[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (
        node.nodeValue?.includes('#') &&
        !node.parentElement?.classList.contains('__hash-highlight') // evita loop
      ) {
        nodes.push(node);
      }
    }

    for (const textNode of nodes) {
      const parent = textNode.parentElement;
      if (!parent) continue;

      const parts = textNode.nodeValue!.split(/(#)/); // mantiene i #
      const frag = document.createDocumentFragment();

      for (const part of parts) {
        if (part === '#') {
          const span = document.createElement('span');
          span.className = '__hash-highlight';
          span.textContent = '#';
          span.style.backgroundColor = 'yellow';
          span.style.color = 'black';
          span.style.padding = '0 2px';
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      }

      parent.replaceChild(frag, textNode);
    }
  };

  const handleEditorChange = (event: any, value?: any) => {
    setTimeout(() => {
      renderPageBreaks();
      if (useHighlight) {
        highlightHashes();
      }
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
        {...props}
        tools={tools}
        defaultEditMode="div"
        onChange={handleEditorChange}
        onMount={handleMount}
      />
    </div>
  );
});

export default CustomEditor;
