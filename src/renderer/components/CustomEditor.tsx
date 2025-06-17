import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import { Editor, EditorProps, EditorTools } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';
// import { arrowsTopBottomIcon } from '@progress/kendo-svg-icons';

const ZOOM_STORAGE_KEY = 'medreport_editor_zoom';
const ROWS_PER_PAGE = 18.8;

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

  // Calcolo e rendering dei page break overlay
  const renderPageBreaks = useCallback(() => {
    const editorBox = editorBoxRef.current;
    if (!editorBox) return;
      editorBox.style.height = '73%';

    const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
    if (!content) return;
    content.style.position = 'relative';
    const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
    if (!proseMirror) return;

    // Overlay solo diretto, mai annidato!
    let overlay = proseMirror.querySelector('.page-break-overlay-layer') as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'page-break-overlay-layer';
      proseMirror.appendChild(overlay);
    }

    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    let lineHeight = 18.8;
    const pageHeightPt = lineHeight * ROWS_PER_PAGE;
    const totalHeight = proseMirror.scrollHeight;

    for (let y = pageHeightPt; y < totalHeight; y += pageHeightPt) {
      const marker = document.createElement('div');
      marker.className = 'auto-page-break';
      marker.style.position = 'absolute';
      marker.style.top = `${y}pt`;
      marker.style.width = '100%';
      marker.style.pointerEvents = 'none';
      marker.style.zIndex = '20';
      marker.style.borderTop = '1.2pt dashed #ff0000';
      marker.innerHTML = `<div opacity:0.8;"> </div>`;
      overlay.appendChild(marker);
    }
    proseMirror.style.width = '440pt';
    proseMirror.style.marginLeft = '100pt';
    proseMirror.style.overflowX = 'hidden';
    proseMirror.style.transform = `scale(${zoomLevel})`;
    proseMirror.style.transformOrigin = "top left";
    proseMirror.style.height = `${100 / zoomLevel}%`;
  }, [zoomLevel]);

  useEffect(() => { sessionStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel)); }, [zoomLevel]);

  useEffect(() => {
    const editorBox = editorBoxRef.current;
    if (!editorBox) return;
    const content = editorBox.querySelector('.k-editor-content') as HTMLElement | null;
    if (!content) return;
    const proseMirror = content.querySelector('.ProseMirror') as HTMLElement | null;
    if (!proseMirror) return;

    renderPageBreaks();

    // -- PATCH: MutationObserver che ignora overlay
    const observer = new MutationObserver((mutations) => {
      // Se la mutazione coinvolge direttamente la page-break-overlay-layer o figli, IGNORA
      const overlay = proseMirror.querySelector('.page-break-overlay-layer');
      if (
        mutations.some(m =>
          (overlay && (m.target === overlay || overlay.contains(m.target as Node)))
        )
      ) {
        return;
      }
      // Solo se riguarda il contenuto editoriale
      renderPageBreaks();
    });
    observer.observe(proseMirror, { childList: true, subtree: true, characterData: true });

    window.addEventListener('resize', renderPageBreaks);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', renderPageBreaks);
      let overlay = proseMirror.querySelector('.page-break-overlay-layer') as HTMLElement | null;
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    // eslint-disable-next-line
  }, [props.defaultContent, zoomLevel, renderPageBreaks]);

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

  return (
    <div ref={editorBoxRef}>
      <Editor
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as any).current = node;
        }}
        {...props}
        tools={tools}
        defaultEditMode="div"
        onChange={handleEditorChange}
      />
    </div>
  );
});

export default CustomEditor;
