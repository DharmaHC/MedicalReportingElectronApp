import React, { useState, forwardRef, useEffect } from 'react';
import { Editor, EditorProps, EditorTools } from '@progress/kendo-react-editor';
import { Button, ToolbarItem } from '@progress/kendo-react-buttons';
import { minusIcon, plusIcon } from '@progress/kendo-svg-icons';

  // ---------- ZoomControls (tutto in un container centrato) ----------
const ZoomControls: React.FC<{
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
}> = ({ zoomLevel, setZoomLevel }) => {
  const [inputValue, setInputValue] = useState(Math.round(zoomLevel * 100).toString());

  useEffect(() => {
    setInputValue(Math.round(zoomLevel * 100).toString());
  }, [zoomLevel]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo numeri: elimina tutto tranne le cifre
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#f6f8fa',
          borderRadius: 6,
          padding: '2px 8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          gap: 2,
          minHeight: 32
        }}
      >
        <Button
          svgIcon={minusIcon}
          onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.5))}
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
          onClick={() => setZoomLevel(z => Math.min(z + 0.1, 2))}
          title="Zoom In"
          style={{ minWidth: 32 }}
        />
      </div>
    </ToolbarItem>
  );
};

// ---------- Componente principale CustomEditor ----------
const CustomEditor = forwardRef<Editor, EditorProps>((props, ref) => {

  // 1. Inizializza a 1.3 (130%) o altro default
  const [zoomLevel, setZoomLevel] = useState<number>(1.3);

  // 2. All'avvio, leggi i settings e aggiorna
  useEffect(() => {
    window.appSettings.get().then(settings => {
      if (settings && typeof settings.editorZoomDefault === 'number') {
        setZoomLevel(settings.editorZoomDefault);
      }
    });
  }, []);

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

  // Inserisci i tuoi tools preferiti e il gruppo zoom come ultimo elemento
  const tools = [
    ...(props.tools ?? defaultTools),
    [
      () => <ZoomControls zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} />
    ]
  ];

  return (
    <Editor
      ref={ref}
      {...props}
      tools={tools}
      contentStyle={{
        transform: `scale(${zoomLevel})`,
        transformOrigin: 'top left',
        transition: 'transform 0.2s',
        ...(props.contentStyle || {}),
      }}
    />
  );
});

export default CustomEditor;
