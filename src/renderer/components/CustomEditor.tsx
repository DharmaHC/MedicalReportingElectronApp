import React, { useRef, useEffect, useState, forwardRef } from 'react';
import { Editor, EditorProps, EditorTools } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';
//import { arrowsTopBottomIcon } from '@progress/kendo-svg-icons';

// Costanti base
const ZOOM_STORAGE_KEY = 'medreport_editor_zoom';

// Quante righe per pagina per il page break?
const ROWS_PER_PAGE = 19; // in pt, considerando l'area stampabile del referto

// === ZoomControls ===
const ZoomControls: React.FC<{
  zoomLevel: number;
  setZoomLevel: (n: number) => void;
}> = ({ zoomLevel, setZoomLevel }) => {
  const [inputValue, setInputValue] = useState(Math.round(zoomLevel * 100).toString());

  useEffect(() => {
    setInputValue(Math.round(zoomLevel * 100).toString());
  }, [zoomLevel]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyNumbers = e.target.value.replace(/\D/g, '');
    setInputValue(onlyNumbers);
  };

  const applyInputValue = () => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 50 && val <= 200) {
      setZoomLevel(val / 100);
    } else {
      setInputValue(Math.round(zoomLevel * 100).toString());
    }
  };

  return (
    <ToolbarItem>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#f6f8fa',
        borderRadius: 6,
        padding: '2px 8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        gap: 2,
        minHeight: 32
      }}>
        <Button
          svgIcon={minusIcon}
          onClick={() => setZoomLevel(Math.max(zoomLevel - 0.1, 0.5))}
          title="Zoom Out"
          style={{ minWidth: 32 }}
        />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={applyInputValue}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              applyInputValue();
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width: 50,
            textAlign: 'center',
            border: '1px solid #ddd',
            background: '#fff',
            borderRadius: 4,
            margin: '0 6px',
            fontWeight: 'bold',
            height: 28
          }}
          maxLength={3}
        />%
        <Button
          svgIcon={plusIcon}
          onClick={() => setZoomLevel(Math.min(zoomLevel + 0.1, 2))}
          title="Zoom In"
          style={{ minWidth: 32 }}
        />
      </div>
    </ToolbarItem>
  );
};

// === CustomEditor ===
const CustomEditor = forwardRef<Editor, EditorProps>((props, ref) => {
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const stored = sessionStorage.getItem(ZOOM_STORAGE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val >= 0.5 && val <= 2) return val;
    }
    return 1.0;
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorBoxRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  
  // ref "any" per view (Kendo Editor instance)
  const editorViewRef = useRef<any>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(ZOOM_STORAGE_KEY);
    if (!stored && (window as any).appSettings && (window as any).appSettings.get) {
      (window as any).appSettings.get().then((settings: any) => {
        if (settings && typeof settings.editorZoomDefault === 'number') {
          setZoomLevel(settings.editorZoomDefault);
          sessionStorage.setItem(ZOOM_STORAGE_KEY, String(settings.editorZoomDefault));
        }
      });
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel));
  }, [zoomLevel]);

  useEffect(() => {
    function checkOverflow() {
      if (wrapperRef.current && editorBoxRef.current) {
        const isOverflow = editorBoxRef.current.scrollHeight > wrapperRef.current.clientHeight;
        setOverflow(isOverflow);
      }
    }
    checkOverflow();

    let observer: MutationObserver | undefined;
    const content = editorBoxRef.current?.querySelector('.k-editor-content');
    if (content) {
      observer = new MutationObserver(checkOverflow);
      observer.observe(content, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener('resize', checkOverflow);

    return () => {
      window.removeEventListener('resize', checkOverflow);
      if (observer) observer.disconnect();
    };
  }, [props.defaultContent, zoomLevel]);


  // ====== Page Break Overlay: Inserisce un separatore ogni N righe (pagina) ======
useEffect(() => {
  const editorBox = editorBoxRef.current;
  if (!editorBox) return;

  const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
  if (!content) return;

  content.style.position = 'relative';

  const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
  if (!proseMirror) return;

  // 1. Rendi ProseMirror commisurato al numero di caratteri massimo per riga e adattato alla miglior visualizzazione sull'app
  proseMirror.style.minWidth = '440pt';
  proseMirror.style.maxWidth = '440pt';
  proseMirror.style.height = '368pt';
  proseMirror.style.marginLeft = '40pt';

  // 2. Cerca o crea l'overlay come figlio DIRETTO di ProseMirror
  let overlay = proseMirror.querySelector('.page-break-overlay-layer') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'page-break-overlay-layer';
    proseMirror.appendChild(overlay); // <- Spostato qui
  }

  // Funzione che aggiorna solo l’overlay
  const renderPageBreaks = () => {
    while (overlay!.firstChild) overlay!.removeChild(overlay!.firstChild);

    const computedStyle = window.getComputedStyle(proseMirror);
    var lineHeight = parseFloat(computedStyle.lineHeight) || 16;
    lineHeight = 19.95 * zoomLevel
    const pageHeightPt = lineHeight * ROWS_PER_PAGE;
    const totalHeight = proseMirror.scrollHeight;

    for (let y = pageHeightPt; y < totalHeight; y += pageHeightPt) {
      const marker = document.createElement('div');
      marker.className = 'auto-page-break';
      // Posiziona i marker in modo assoluto rispetto all'overlay (che è dentro ProseMirror)
      marker.style.position = 'absolute';
      marker.style.top = `${y * zoomLevel}pt`;
      marker.style.width = '100%';
      marker.style.pointerEvents = 'none';
      marker.style.zIndex = '20';
      marker.style.borderTop = '1pt dashed #ff0000';

      marker.innerHTML = `<div opacity:0.8;"> </div>`;
      overlay!.appendChild(marker);
    }
  };

 // Applica lo zoom al ProseMirror!
  proseMirror.style.transform = `scale(${zoomLevel})`;
  proseMirror.style.transformOrigin = "top left"; // Evita sfasamenti strani

  // Facoltativo: aggiusta la larghezza perché lo scaling non "stringa" tutto
  proseMirror.style.height = `${100 / zoomLevel}%`;

  // L'observer rimane su ProseMirror, il che è corretto
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(m => (m.target as HTMLElement).classList?.contains('page-break-overlay-layer'))) return;
    renderPageBreaks();
  });
  observer.observe(proseMirror, { childList: true, subtree: true, characterData: true });

  renderPageBreaks();
  window.addEventListener('resize', renderPageBreaks);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', renderPageBreaks);
    // Pulisci l'overlay quando il componente viene smontato
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };
}, [props.defaultContent, zoomLevel]);


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
    ...(props.tools ?? defaultTools),
    [
      () => <ZoomControls zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} />
    ]
  ];

return (
  <div ref={editorBoxRef} style={{ position: 'relative', height: '100%' }}>
    <Editor
      ref={(node) => {
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as any).current = node;
        editorViewRef.current = node?.view || node;
      }}
      {...props}
      tools={tools}
      defaultEditMode="div"
    />
  </div>
);
});

export default CustomEditor;
