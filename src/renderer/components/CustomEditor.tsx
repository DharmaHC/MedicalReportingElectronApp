import React, { useRef, useEffect, useState, forwardRef } from 'react';
import { Editor, EditorProps, EditorTools } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';
import { arrowsTopBottomIcon } from '@progress/kendo-svg-icons';

// Costanti base
const CHAR_PER_ROW = 86;
const CHAR_WIDTH = 8.5;
const BASE_WIDTH = CHAR_PER_ROW * CHAR_WIDTH;
const ZOOM_STORAGE_KEY = 'medreport_editor_zoom';

// Quante righe per pagina? Puoi variare a piacere.
const ROWS_PER_PAGE = 43; // esempio: 43 righe da 16px ~ formato A4

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

  // ====== AGGIUNTA: Logica per auto-page-break grafico ======
  useEffect(() => {
    const interval = setTimeout(() => {
      const editorBox = editorBoxRef.current;
      if (!editorBox) return;
      const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
      if (!content) return;

      // Rimuovi tutti i vecchi marker (per evitare duplicati)
      Array.from(content.querySelectorAll('.auto-page-break')).forEach(node => node.remove());

      // Calcola l'altezza di una pagina (dipende dal fontSize, zoom, e lineHeight)
      // Assumiamo che il line-height sia quello standard impostato nei CSS (es: 16px * 1.2)
      const computedStyle = window.getComputedStyle(content);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 16;
      const pageHeight = lineHeight * ROWS_PER_PAGE * zoomLevel;

      // Scorri tutti i figli blocco (paragrafi, div, elenchi, ecc)
      let accumHeight = 0;
      let currentPage = 1;
      const blocks = Array.from(content.children);

      for (let i = 0; i < blocks.length; ++i) {
        const el = blocks[i] as HTMLElement;
        if (!el || el.classList.contains('auto-page-break')) continue;

        const rect = el.getBoundingClientRect();
        const prevHeight = accumHeight;
        accumHeight += el.offsetHeight;

        // Se superi il limite della pagina e NON siamo già a fine contenuto, inserisci un separatore
        if (accumHeight > currentPage * pageHeight && i !== blocks.length - 1) {
          // Crea il marker
          const marker = document.createElement('div');
          marker.className = 'auto-page-break';
          // Aggiungi testo/icone qui se vuoi renderlo più visibile (opzionale)
          marker.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;"><svg width="32" height="16" style="margin-right:8px;opacity:0.5;" viewBox="0 0 24 24" fill="none"><path d="M2 12h20M12 6v12" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3"/></svg><span style="font-size:11px;color:#aaa;opacity:0.7;">SEPARATORE PAGINA</span></div>`;
          // Inserisci subito prima dell'elemento corrente
          el.parentNode?.insertBefore(marker, el);
          currentPage++;
          // Dopo aver aggiunto, aggiorna accumHeight come se fosse una riga in più
          accumHeight += lineHeight;
        }
      }
    }, 80); // leggero debounce

    return () => clearTimeout(interval);
  }, [props.defaultContent, zoomLevel]);
  // Se vuoi page break anche in edit live, puoi aggiungere deps che triggerano ad ogni modifica

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
    <div
      ref={wrapperRef}
      className={`custom-editor-main-wrapper${overflow ? ' custom-editor-overflow' : ''}`}
      style={{
        width: '100%',
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        height: '100% ! important',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: overflow ? 'flex-start' : 'top',
        //overflowY: 'auto',
      }}
    >
      <div
        ref={editorBoxRef}
        style={{
          width: `${BASE_WIDTH * zoomLevel}px`,
          minWidth: `${BASE_WIDTH * 0.5}px`,
          maxWidth: `${BASE_WIDTH * 2}px`,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 8,
          height: '100%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          position: 'relative',
          transition: 'box-shadow 0.15s'
        }}
      >
        <Editor
          ref={(node) => {
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as any).current = node;
            editorViewRef.current = node?.view || node;
          }}
          {...props}
          tools={tools}
          defaultEditMode="div"
          style={{ width: '100%' }}
          contentStyle={{
            width: `${BASE_WIDTH}px`,
            maxWidth: `${BASE_WIDTH}px`,
            minWidth: `${BASE_WIDTH}px`,
            //overflowX: 'hidden',
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left',
            paddingBottom: '20',
            height: '100%',
            maxHeight: 'none',
            transition: 'transform 0.2s',
          }}
        />
      </div>
    </div>
  );
});

export default CustomEditor;
