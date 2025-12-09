import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import {
  setPrescriptionContent,
  setIsEditingPrescription,
  resetPrescriptionState,
} from '../store/prescriptionSlice';
import {
  Dialog,
  DialogActionsBar,
} from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';
import { Editor, EditorTools, EditorUtils } from '@progress/kendo-react-editor';
import { Notification, NotificationGroup } from '@progress/kendo-react-notification';
import { TreeView, TreeViewItemClickEvent } from '@progress/kendo-react-treeview';
import { Input } from '@progress/kendo-react-inputs';
import { Checkbox } from '@progress/kendo-react-inputs';
import {
  url_savePrescription,
  url_getPredefinedTexts,
  url_getUserDisplayName,
} from '../utility/urlLib';

// Interfaccia per la struttura di una frase predefinita
interface Phrase {
  textParent: string | null;
  textDescription: string | null;
  textContent: string;
  parent: string | null;
}

// Interfaccia per i nodi della TreeView
interface TreeNode {
  text: string;
  items?: TreeNode[];
  expanded?: boolean;
}

const {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent,
  Outdent,
  OrderedList,
  UnorderedList,
  Undo,
  Redo,
  FontSize,
  FontName,
  ForeColor,
  BackColor,
} = EditorTools;

const PrescriptionEditorModal: React.FC = () => {
  const dispatch = useDispatch();

  // Redux state
  const isOpen = useSelector(
    (state: RootState) => state.prescription.isEditingPrescription
  );
  const content = useSelector(
    (state: RootState) => state.prescription.prescriptionContent
  );
  const examResultId = useSelector(
    (state: RootState) => state.prescription.currentExamResultId
  );
  const examinationId = useSelector(
    (state: RootState) => state.prescription.currentExaminationId
  );
  const isReadOnly = useSelector(
    (state: RootState) => state.prescription.isReadOnly
  );
  const createdBy = useSelector(
    (state: RootState) => state.prescription.createdBy
  );
  const examDescription = useSelector(
    (state: RootState) => state.prescription.examDescription
  );
  const linkedExams = useSelector(
    (state: RootState) => state.prescription.linkedExams
  );
  const token = useSelector((state: RootState) => state.auth.token);
  const technicianCode = useSelector(
    (state: RootState) => state.auth.technicianCode || state.auth.userName
  );

  // Local state
  const [editorContent, setEditorContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [creatorDisplayName, setCreatorDisplayName] = useState<string>('');
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({ show: false, message: '', type: 'info' });

  // Phrase states
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [includeAllExamsPhrases, setIncludeAllExamsPhrases] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const editorRef = useRef<any>(null);

  // Sync Redux content to local state when modal opens OR when content changes
  useEffect(() => {
    if (isOpen) {
      // Debug: log initial content
      console.log('=== EDITOR CONTENT DEBUG ===');
      console.log('Content length:', content?.length || 0);
      console.log('Content:', JSON.stringify(content));
      console.log('First 10 charCodes:', content?.substring(0, 10).split('').map(c => c.charCodeAt(0)).join(','));

      // Normalize content: remove ONLY leading/trailing whitespace, keep HTML structure intact
      let normalizedContent = (content || '').trim();

      // If content is empty or contains only whitespace/html tags, set to empty paragraph
      if (!normalizedContent || normalizedContent === '<p></p>' || normalizedContent === '<br>') {
        normalizedContent = '<p></p>';
        console.log('Content was empty or invalid, normalized to:', normalizedContent);
      } else {
        // DON'T remove wrapper div - keep HTML structure intact
        // The editor might need the wrapper for proper rendering
        console.log('Content normalized (whitespace only), length:', normalizedContent.length);
      }

      setEditorContent(normalizedContent);

      // Set focus on editor after a short delay to ensure it's rendered
      setTimeout(() => {
        if (editorRef.current?.view) {
          editorRef.current.view.focus();
          console.log('Editor focused');
        }
      }, 150);
    }
  }, [isOpen, content]); // Sync when modal opens OR when content from Redux changes

  // Fetch creator display name when modal opens with existing prescription
  useEffect(() => {
    const fetchCreatorName = async () => {
      if (isOpen && createdBy && isReadOnly) {
        try {
          const response = await fetch(
            `${url_getUserDisplayName()}?taxCode=${encodeURIComponent(createdBy)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            setCreatorDisplayName(data.displayName || createdBy);
          } else {
            setCreatorDisplayName(createdBy);
          }
        } catch (error) {
          console.error('Error fetching creator display name:', error);
          setCreatorDisplayName(createdBy);
        }
      } else {
        setCreatorDisplayName('');
      }
    };

    fetchCreatorName();
  }, [isOpen, createdBy, isReadOnly, token]);

  // Handle editor content change
  const handleEditorChange = (event: any) => {
    // Prevent changes if read-only
    if (isReadOnly) {
      return;
    }
    const newContent = event.html;
    // Update local state for saving later (editor is uncontrolled, but we track changes)
    setEditorContent(newContent);
    // DON'T dispatch to Redux during typing to prevent re-renders
  };

  // Build tree structure from phrases - already expanded
  const buildTree = (phrases: Phrase[], srch: string): TreeNode[] => {
    const parents: Record<string, TreeNode> = {};

    phrases.forEach((p) => {
      const { textParent, textDescription, textContent } = p;

      // Filter by search term
      if (!textContent?.toLowerCase().includes(srch.toLowerCase())) return;

      // Level 1: Category (textParent) - Only "Prescrizioni RX"
      if (!textParent || textParent !== 'Prescrizioni RX') return;

      if (!parents[textParent]) {
        parents[textParent] = { text: textParent, items: [], expanded: true }; // Already expanded
      }

      // Level 2: Subcategory (textDescription)
      if (textDescription) {
        let subCat = parents[textParent].items?.find(
          (child) => child.text === textDescription
        );
        if (!subCat) {
          subCat = { text: textDescription, items: [], expanded: true }; // Already expanded
          parents[textParent].items?.push(subCat);
        }
        subCat.items?.push({ text: textContent });
      } else {
        parents[textParent].items?.push({ text: textContent });
      }
    });

    return Object.values(parents);
  };

  // Fetch predefined texts
  const fetchPredefinedTexts = useCallback(async () => {
    if (!token) return;

    // Build linked results list from linkedExams
    const linkedResultsList = includeAllExamsPhrases
      ? []
      : linkedExams && linkedExams.length > 0
      ? linkedExams.map((exam) => ({
          examId: exam.examId, // Use the real examId from the exam object
          examVersion: 0,
          subExamId: 0,
          examResultId: exam.examResultId,
        }))
      : [];

    const qs = new URLSearchParams();
    // Don't include doctorCode parameter - backend will treat it as null
    qs.append('includeNotAssigned', 'true'); // Always include unassigned
    qs.append('includeAllDoctors', 'true'); // No doctor filter for prescriptions
    qs.append('includeAllExams', String(includeAllExamsPhrases));

    console.log('=== FETCH PREDEFINED TEXTS DEBUG ===');
    console.log('linkedExams:', linkedExams);
    console.log('linkedResultsList:', linkedResultsList);
    console.log('Query params:', qs.toString());
    console.log('includeAllExamsPhrases:', includeAllExamsPhrases);

    try {
      // IMPORTANT: Backend expects the array directly in body, not wrapped in an object (like EditorPage does)
      console.log('Request body (linkedResultsList array):', JSON.stringify(linkedResultsList));

      const response = await fetch(
        `${url_getPredefinedTexts()}?${qs.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(linkedResultsList),
        }
      );

      if (!response.ok) {
        console.error('Error GetPredefinedTexts:', response.status);
        return;
      }

      const data = await response.json();

      // DEBUG: Log all phrases received
      console.log('=== PRESCRIPTION PHRASES DEBUG ===');
      console.log('Total phrases received:', data.length);
      console.log('All phrases:', data);

      // Group by textParent to see what groups exist
      const groupedByParent = data.reduce((acc: any, p: Phrase) => {
        const parent = p.textParent || 'null';
        if (!acc[parent]) acc[parent] = 0;
        acc[parent]++;
        return acc;
      }, {});
      console.log('Phrases grouped by textParent:', groupedByParent);

      // Filter only "Prescrizioni RX" group
      const prescriptionPhrases = data.filter(
        (p: Phrase) => p.textParent === 'Prescrizioni RX'
      );
      console.log('Filtered "Prescrizioni RX" phrases:', prescriptionPhrases.length);
      console.log('Prescrizioni RX phrases:', prescriptionPhrases);
      console.log('=== END DEBUG ===');

      setPhrases(prescriptionPhrases);

      // Auto-flag "Testi di Tutti gli Esami" if no phrases found for this examId
      if (!includeAllExamsPhrases && prescriptionPhrases.length === 0) {
        console.log('No phrases for this examId, auto-enabling "Testi di Tutti gli Esami"');
        setIncludeAllExamsPhrases(true);
      }
    } catch (err) {
      console.error('Error fetchPredefinedTexts:', err);
    }
  }, [token, includeAllExamsPhrases, linkedExams]);

  // Load phrases when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPredefinedTexts();
    }
  }, [isOpen, fetchPredefinedTexts]);

  // Rebuild tree when phrases or search term change
  useEffect(() => {
    const dataTree = buildTree(phrases, searchTerm);
    setTreeData(dataTree);
  }, [phrases, searchTerm]);

  // Handle tree item click
  const handleTreeItemClick = (event: TreeViewItemClickEvent) => {
    const item = event.item;

    // If has children, toggle expansion
    if (item.items && item.items.length > 0) {
      const updateExpanded = (nodes: TreeNode[], target: TreeNode): TreeNode[] => {
        return nodes.map((node) => {
          if (node.text === target.text) {
            return { ...node, expanded: !node.expanded };
          }
          if (node.items) {
            return { ...node, items: updateExpanded(node.items, target) };
          }
          return node;
        });
      };
      setTreeData((prev) => updateExpanded(prev, item));
      return;
    }

    // Insert phrase into editor
    handlePhraseClick(item.text);
  };

  // Insert phrase into editor
  const handlePhraseClick = (phrase: string) => {
    if (!editorRef.current?.view) return;
    const view = editorRef.current.view;
    view.focus();

    const { state, dispatch: editorDispatch } = view;
    const { from } = state.selection;
    let pos = from;
    let tr = state.tr;

    const lines = phrase.split(/\r?\n/);

    lines.forEach((line, idx) => {
      if (idx > 0) {
        tr = tr.insert(pos, state.schema.nodes.hard_break.create());
        pos++;
      }
      if (line) {
        tr = tr.insertText(line, pos);
        pos += line.length;
      }
    });

    editorDispatch(tr);
  };

  // Handle save prescription
  const handleSave = async () => {
    if (!examResultId || !examinationId || !technicianCode) {
      showNotification('Dati mancanti per salvare la prescrizione', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Prepara la lista di examResultIds (tutti gli esami collegati)
      const examResultIds = linkedExams && linkedExams.length > 0
        ? linkedExams.map(exam => exam.examResultId)
        : [examResultId];

      console.log('=== SAVE PRESCRIPTION DEBUG ===');
      console.log('Editor content length:', editorContent?.length || 0);
      console.log('Editor content preview:', editorContent?.substring(0, 500));
      console.log('ExamResultIds:', examResultIds);
      console.log('TechnicianCode:', technicianCode);

      const response = await fetch(url_savePrescription(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          htmlContent: editorContent,
          examResultIds: examResultIds, // Passa array invece di singolo ID
          examinationId: examinationId,
          technicianCode: technicianCode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SavePrescription error response:', errorText);
        let errorData = null;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('Response is not JSON:', errorText);
        }
        throw new Error(
          errorData?.message || `Errore HTTP: ${response.status} - ${errorText.substring(0, 200)}`
        );
      }

      const data = await response.json();
      showNotification(data.message || 'Prescrizione salvata con successo', 'success');

      // Se la prescrizione è stata eliminata (prescriptionId è null),
      // potremmo voler aggiornare lo stato nel componente genitore
      // ma questo verrà gestito al reload della griglia

      // Chiudi modal dopo 1.5 secondi
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error: any) {
      console.error('Error saving prescription:', error);
      showNotification(
        error.message || 'Errore durante il salvataggio della prescrizione',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle close modal
  const handleClose = () => {
    dispatch(resetPrescriptionState());
    setEditorContent('');
  };

  // Show notification
  const showNotification = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ) => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'info' });
    }, 4000);
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog
        title={
          isReadOnly
            ? `Prescrizione (Solo lettura - Creata da: ${creatorDisplayName || createdBy})`
            : 'Prescrizione Tecnica'
        }
        onClose={handleClose}
        width="90vw"
        height="85vh"
      >
        <div style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header section with descriptions */}
          <div>
            {examDescription && (
              <div
                style={{
                  backgroundColor: '#e3f2fd',
                  border: '1px solid #2196F3',
                  padding: '8px 12px',
                  marginBottom: '10px',
                  borderRadius: '4px',
                  color: '#0d47a1',
                  fontWeight: 'bold',
                }}
              >
                {examDescription}
              </div>
            )}

            {linkedExams && linkedExams.length > 1 && (
              <div
                style={{
                  backgroundColor: '#f1f8e9',
                  border: '1px solid #8bc34a',
                  padding: '8px 12px',
                  marginBottom: '10px',
                  borderRadius: '4px',
                  color: '#33691e',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                  Esami collegati ({linkedExams.length}):
                </div>
                <ul style={{ margin: '0', paddingLeft: '20px' }}>
                  {linkedExams.map((exam, index) => (
                    <li key={index} style={{ marginBottom: '2px' }}>
                      {exam.examName}
                      {exam.subExamName && ` - ${exam.subExamName}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isReadOnly && (
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  padding: '10px',
                  marginBottom: '10px',
                  borderRadius: '4px',
                  color: '#856404',
                }}
              >
                <strong>Attenzione:</strong> Questa prescrizione è stata creata da{' '}
                <strong>{creatorDisplayName || createdBy}</strong>. Non puoi modificarla.
              </div>
            )}
          </div>

          {/* Main content: Phrases (left) and Editor (right) */}
          <div style={{ display: 'flex', flex: 1, gap: '10px', minHeight: 0 }}>
            {/* Phrases section - narrower - hidden for read-only (doctors) */}
            {!isReadOnly && (
              <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', border: '1px solid #ccc', borderRadius: '4px', padding: '8px', backgroundColor: '#f9f9f9' }}>
                <div style={{ marginBottom: '8px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold' }}>Frasario Prescrizioni</h4>

                  {/* Search input */}
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.value || '')}
                    placeholder="Cerca frase..."
                    style={{ width: '100%', marginBottom: '10px' }}
                  />

                  {/* Checkbox filter */}
                  <Checkbox
                    checked={includeAllExamsPhrases}
                    label="Testi di Tutti gli Esami"
                    onChange={(e) => setIncludeAllExamsPhrases(e.value || false)}
                  />
                </div>

                {/* TreeView */}
                <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '3px', padding: '3px', backgroundColor: 'white' }}>
                  <TreeView
                    data={treeData}
                    expandIcons={true}
                    onItemClick={handleTreeItemClick}
                    textField="text"
                    item={(props) => (
                      <span style={{ cursor: 'pointer', fontSize: '11px', lineHeight: '1.3' }}>
                        {props.item.text}
                      </span>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Editor section - takes remaining space */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <Editor
                ref={editorRef}
                value={editorContent}
                onChange={handleEditorChange}
                tools={isReadOnly ? [] : [
                  [Bold, Italic, Underline],
                  [FontSize, FontName],
                  [ForeColor, BackColor],
                  [AlignLeft, AlignCenter, AlignRight],
                  [Indent, Outdent],
                  [UnorderedList, OrderedList],
                  [Undo, Redo],
                ]}
                contentStyle={{
                  height: '550px',
                  fontSize: '12pt',
                  fontFamily: 'Arial, sans-serif',
                  backgroundColor: isReadOnly ? '#f5f5f5' : 'white',
                  cursor: isReadOnly ? 'default' : 'text',
                }}
              />
              {isReadOnly && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'transparent',
                  cursor: 'not-allowed',
                  zIndex: 1
                }} />
              )}
            </div>
          </div>
        </div>

        <DialogActionsBar>
          {!isReadOnly && (
            <Button
              themeColor="primary"
              onClick={handleSave}
              disabled={isSaving}
              icon={isSaving ? 'loading' : 'save'}
            >
              {isSaving ? 'Salvataggio...' : 'Salva'}
            </Button>
          )}
          <Button onClick={handleClose}>
            {isReadOnly ? 'Chiudi' : 'Annulla'}
          </Button>
        </DialogActionsBar>
      </Dialog>

      {/* Notification */}
      {notification.show && (
        <NotificationGroup
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
          }}
        >
          <Notification
            type={{ style: notification.type, icon: true }}
            closable={true}
            onClose={() =>
              setNotification({ show: false, message: '', type: 'info' })
            }
          >
            <span>{notification.message}</span>
          </Notification>
        </NotificationGroup>
      )}
    </>
  );
};

export default PrescriptionEditorModal;
