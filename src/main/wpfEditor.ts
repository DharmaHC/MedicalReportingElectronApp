/**
 * WPF RadRichTextEditor companion process manager.
 *
 * Spawns MedReportEditor.exe (WPF) and communicates via Named Pipe.
 * Protocol: newline-delimited JSON over a Named Pipe.
 *
 * Commands (Electron → WPF):
 *   LOAD_RTF  { command, data: base64 }
 *   GET_RTF   { command }
 *   GET_PDF   { command }
 *   SHOW      { command }
 *   HIDE      { command }
 *   SET_BOUNDS { command, x, y, width, height }
 *   SET_ZOOM  { command, zoom }
 *   FOCUS     { command }
 *   PING      { command }
 *
 * Events (WPF → Electron):
 *   READY        - pipe connected, editor ready
 *   OK           - command acknowledged
 *   RTF_CONTENT  - response to GET_RTF, { type, data: base64 }
 *   PDF_CONTENT  - response to GET_PDF, { type, data: base64 }
 *   ERROR        - { type, message }
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { existsSync } from 'fs';
import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

const PIPE_PREFIX = '\\\\.\\pipe\\';
let wpfProcess: ChildProcess | null = null;
let pipeClient: net.Socket | null = null;
let pipeName: string = '';
let isReady = false;
let readyResolve: (() => void) | null = null;
let pendingCallbacks: Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map();
let messageBuffer = '';
let isEditorVisible = false;
let windowListenersSetup = false;
let lastBoundsPayload: { x: number; y: number; width: number; height: number } | null = null;
let lastViewportSize: { width: number; height: number } | null = null;
let lastViewportDpr: number | null = null;
let lastBoundsDebugSignature = '';
let lastBoundsDebugAt = 0;
let hostWindowId: number | null = null;
let managerState: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted' = 'stopped';
let managerReason: string | undefined = undefined;
const activeSessions = new Set<string>();

type WpfEditorStatus = {
  state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted';
  isReady: boolean;
  isVisible: boolean;
  activeSessions: number;
  reason?: string;
};

function getStatusSnapshot(): WpfEditorStatus {
  return {
    state: managerState,
    isReady: isEditorReady(),
    isVisible: isEditorVisible,
    activeSessions: activeSessions.size,
    reason: managerReason,
  };
}

function emitStatus(): void {
  const status = getStatusSnapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('wpf-editor:status', status);
  }
}

function setManagerState(
  state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted',
  reason?: string
): void {
  managerState = state;
  managerReason = reason;
  emitStatus();
}

function logBoundsDebug(payload: Record<string, unknown>): void {
  try {
    const serialized = JSON.stringify(payload);
    const now = Date.now();
    if (serialized === lastBoundsDebugSignature && now - lastBoundsDebugAt < 2500) return;
    lastBoundsDebugSignature = serialized;
    lastBoundsDebugAt = now;
    log.info(`[WPF BOUNDS] ${serialized}`);
  } catch (err: any) {
    log.warn(`[WPF BOUNDS] Log error: ${err?.message ?? err}`);
  }
}

function getHostWindow(preferred?: BrowserWindow | null): BrowserWindow | null {
  if (preferred && !preferred.isDestroyed()) {
    hostWindowId = preferred.id;
    return preferred;
  }

  if (hostWindowId != null) {
    const tracked = BrowserWindow.fromId(hostWindowId);
    if (tracked && !tracked.isDestroyed()) return tracked;
    hostWindowId = null;
  }

  const fallback = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (fallback && !fallback.isDestroyed()) {
    hostWindowId = fallback.id;
    return fallback;
  }
  return null;
}

/**
 * Restituisce il path dell'eseguibile WPF.
 * In development: dalla cartella build del progetto WPF.
 * In produzione: dalla cartella resources dell'app Electron.
 */
function getWpfExePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'wpf-editor', 'MedReportEditor.exe');
  }
  // Dev: build output del progetto WPF
  return path.join(
    __dirname,
    '..', '..', 'MedReportEditor.Wpf', 'bin', 'Debug', 'net8.0-windows', 'MedReportEditor.exe'
  );
}

/**
 * Avvia il processo WPF e connette il Named Pipe.
 * Attende il messaggio READY dal WPF prima di ritornare.
 */
export async function startWpfEditor(): Promise<void> {
  if (wpfProcess && !wpfProcess.killed) {
    log.info('[WPF Editor] Processo gia\' attivo');
    setManagerState(isEditorVisible ? 'ready_visible' : 'ready_hidden');
    return;
  }
  setManagerState('starting');

  pipeName = `MedReportEditor_${process.pid}_${Date.now()}`;
  const exePath = getWpfExePath();
  if (!existsSync(exePath)) {
    setManagerState('faulted', `Eseguibile non trovato: ${exePath}`);
    throw new Error(`[WPF Editor] Eseguibile non trovato: ${exePath}`);
  }

  log.info(`[WPF Editor] Avvio: ${exePath} --pipe ${pipeName}`);

  // Pulisci TELERIK_LICENSE env var (troncata a 4095 char su Windows)
  // per forzare il WPF a usare telerik-license.txt dal suo cwd
  const env = { ...process.env };
  delete env.TELERIK_LICENSE;

  wpfProcess = spawn(exePath, ['--pipe', pipeName], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env,
    cwd: path.dirname(exePath),
  });

  wpfProcess.stdout?.on('data', (data: Buffer) => {
    log.info(`[WPF stdout] ${data.toString().trim()}`);
  });

  wpfProcess.stderr?.on('data', (data: Buffer) => {
    log.error(`[WPF stderr] ${data.toString().trim()}`);
  });

  wpfProcess.on('exit', (code) => {
    log.info(`[WPF Editor] Processo terminato con codice ${code}`);
    wpfProcess = null;
    pipeClient = null;
    isReady = false;
    isEditorVisible = false;
    // Reject all pending callbacks
    for (const [id, cb] of pendingCallbacks) {
      cb.reject(new Error('WPF process exited'));
    }
    pendingCallbacks.clear();
    setManagerState('stopped', code != null ? `exit_code_${code}` : undefined);
  });

  wpfProcess.on('error', (err) => {
    log.error(`[WPF Editor] Errore avvio processo: ${err.message}`);
    setManagerState('faulted', err.message);
  });

  // Connetti al pipe e attendi il messaggio READY dal WPF
  await connectToPipe(pipeName);
  await waitForReady(15000);
  log.info('[WPF Editor] Pronto per ricevere comandi');
  setManagerState('ready_hidden');
}

/**
 * Attende che il WPF invii il messaggio READY (max timeoutMs).
 */
function waitForReady(timeoutMs: number): Promise<void> {
  if (isReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    readyResolve = resolve;
    const timer = setTimeout(() => {
      readyResolve = null;
      reject(new Error(`WPF Editor READY timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    // Se isReady diventa true, readyResolve viene chiamato in handleMessage
    const origResolve = readyResolve;
    readyResolve = () => {
      clearTimeout(timer);
      origResolve?.();
      resolve();
    };
  });
}

/**
 * Invia un comando SET_PARENT per rendere la finestra WPF figlia della finestra Electron.
 * Il handle nativo viene ottenuto da BrowserWindow.
 */
export async function setParentWindow(sourceWindow?: BrowserWindow | null): Promise<void> {
  const win = getHostWindow(sourceWindow);
  if (!win) {
    log.warn('[WPF Editor] Nessuna BrowserWindow trovata per setParent');
    return;
  }
  const hwndBuf = win.getNativeWindowHandle();
  // Il buffer contiene un handle nativo (pointer) in formato little-endian
  // Su Windows 64-bit e' un BigInt, ma WPF accetta un long
  const hwnd = hwndBuf.length >= 8
    ? hwndBuf.readBigInt64LE(0).toString()
    : hwndBuf.readInt32LE(0).toString();
  log.info(`[WPF Editor] SET_PARENT hwnd=${hwnd}`);
  await sendCommand('SET_PARENT', { hwnd });
}

/**
 * Connette al Named Pipe del processo WPF con retry.
 */
async function connectToPipe(name: string, maxRetries = 20, delayMs = 500): Promise<void> {
  const pipePath = PIPE_PREFIX + name;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const client = net.connect(pipePath, () => {
          pipeClient = client;
          messageBuffer = '';

          client.on('data', (data: Buffer) => {
            let text = data.toString('utf-8');
            // Strip BOM se presente (UTF-8 BOM = \uFEFF)
            if (messageBuffer.length === 0 && text.charCodeAt(0) === 0xFEFF) {
              text = text.substring(1);
            }
            messageBuffer += text;
            processMessageBuffer();
          });

          client.on('end', () => {
            log.info('[WPF Editor] Pipe disconnesso');
            pipeClient = null;
            isReady = false;
          });

          client.on('error', (err) => {
            log.error(`[WPF Editor] Errore pipe: ${err.message}`);
          });

          resolve();
        });

        client.on('error', (err) => {
          reject(err);
        });
      });

      log.info(`[WPF Editor] Connesso al pipe ${pipePath}`);
      return; // Connessione riuscita
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`Impossibile connettersi al pipe ${pipePath} dopo ${maxRetries} tentativi`);
}

/**
 * Processa il buffer dei messaggi (newline-delimited JSON).
 */
function processMessageBuffer(): void {
  const lines = messageBuffer.split('\n');
  // L'ultima parte potrebbe essere incompleta
  messageBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch (err) {
      log.error(`[WPF Editor] JSON parse error: ${line}`);
    }
  }
}

/**
 * Gestisce un messaggio ricevuto dal processo WPF.
 */
function handleMessage(msg: any): void {
  if (msg.type === 'READY') {
    isReady = true;
    log.info('[WPF Editor] Editor pronto');
    if (readyResolve) {
      readyResolve();
      readyResolve = null;
    }
    return;
  }

  // Risposte a comandi pendenti
  if (msg.type === 'OK' && msg.command) {
    const cb = pendingCallbacks.get(msg.command);
    if (cb) {
      pendingCallbacks.delete(msg.command);
      cb.resolve(msg);
    }
    return;
  }

  if (msg.type === 'RTF_CONTENT') {
    const cb = pendingCallbacks.get('GET_RTF');
    if (cb) {
      pendingCallbacks.delete('GET_RTF');
      cb.resolve(msg.data); // base64
    }
    return;
  }

  if (msg.type === 'PDF_CONTENT') {
    const cb = pendingCallbacks.get('GET_PDF');
    if (cb) {
      pendingCallbacks.delete('GET_PDF');
      cb.resolve(msg.data); // base64
    }
    return;
  }

  if (msg.type === 'IS_DIRTY') {
    const cb = pendingCallbacks.get('IS_DIRTY');
    if (cb) {
      pendingCallbacks.delete('IS_DIRTY');
      cb.resolve(msg.dirty);
    }
    return;
  }

  if (msg.type === 'PONG') {
    const cb = pendingCallbacks.get('PING');
    if (cb) {
      pendingCallbacks.delete('PING');
      cb.resolve(true);
    }
    return;
  }

  if (msg.type === 'ERROR') {
    log.error(`[WPF Editor] Errore: ${msg.message}`);
    // Reject il primo callback pendente
    const first = pendingCallbacks.entries().next().value;
    if (first) {
      const [id, cb] = first;
      pendingCallbacks.delete(id);
      cb.reject(new Error(msg.message));
    }
    return;
  }
}

/**
 * Invia un comando al processo WPF e attende la risposta.
 */
function sendCommand(command: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!pipeClient || !isReady) {
      reject(new Error('WPF Editor non connesso'));
      return;
    }

    pendingCallbacks.set(command, { resolve, reject });

    const msg = data ? { command, ...data } : { command };
    const json = JSON.stringify(msg) + '\n';

    pipeClient.write(json, 'utf-8', (err) => {
      if (err) {
        pendingCallbacks.delete(command);
        reject(err);
      }
    });

    // Timeout 30s
    setTimeout(() => {
      if (pendingCallbacks.has(command)) {
        pendingCallbacks.delete(command);
        reject(new Error(`Timeout comando ${command}`));
      }
    }, 30000);
  });
}

/**
 * Invia un comando al processo WPF senza attendere ack.
 * Usato per SET_BOUNDS per evitare race sul callback map (chiave = command).
 */
function sendCommandNoAck(command: string, data?: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!pipeClient || !isReady) {
      reject(new Error('WPF Editor non connesso'));
      return;
    }
    const msg = data ? { command, ...data } : { command };
    const json = JSON.stringify(msg) + '\n';
    pipeClient.write(json, 'utf-8', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Carica contenuto RTF nell'editor WPF.
 */
export async function loadRtf(rtfBase64: string): Promise<void> {
  await sendCommand('LOAD_RTF', { data: rtfBase64 });
}

/**
 * Ottiene il contenuto RTF corrente dall'editor.
 */
export async function getRtf(): Promise<string> {
  return await sendCommand('GET_RTF');
}

/**
 * Ottiene il PDF dal documento corrente nell'editor.
 */
export async function getPdf(): Promise<string> {
  return await sendCommand('GET_PDF');
}

/**
 * Mostra la finestra WPF.
 */
export async function showEditor(): Promise<void> {
  await sendCommand('SHOW');
  isEditorVisible = true;
  setupWindowListeners();
  setManagerState('ready_visible');
}

/**
 * Nasconde la finestra WPF.
 */
export async function hideEditor(): Promise<void> {
  await sendCommand('HIDE');
  isEditorVisible = false;
  setManagerState('ready_hidden');
}

/**
 * Forza il focus sull'editor WPF (utile dopo switch da altra finestra).
 */
export async function focusEditor(): Promise<void> {
  if (!isReady || !isEditorVisible) return;
  await sendCommand('FOCUS');
}

/**
 * Registra listener sulla BrowserWindow per:
 * - Riposizionare l'overlay WPF quando Electron si sposta (l'overlay e' top-level, non si
 *   muove automaticamente col parent). Solo 'move', non 'resize' (il resize e' gestito dal
 *   frontend via ResizeObserver che invia nuovi bounds).
 * - Ri-focalizzare l'editor WPF quando Electron viene riattivato (Alt+Tab back).
 */
function setupWindowListeners(): void {
  if (windowListenersSetup) return;
  const win = getHostWindow();
  if (!win) return;
  windowListenersSetup = true;

  // Quando Electron si sposta, riposiziona overlay (coords relative invariate,
  // ClientToScreen nel WPF ricalcola le coords schermo)
  win.on('move', () => {
    if (isEditorVisible && isReady && lastBoundsPayload) {
      setBounds(
        lastBoundsPayload.x,
        lastBoundsPayload.y,
        lastBoundsPayload.width,
        lastBoundsPayload.height,
        lastViewportSize?.width,
        lastViewportSize?.height,
        lastViewportDpr ?? undefined
      ).catch(() => {});
    }
  });

  // Auto-focus WPF quando Electron viene riattivato da Alt+Tab
  win.on('focus', () => {
    if (isEditorVisible && isReady) {
      setTimeout(() => {
        sendCommand('FOCUS').catch(() => {});
      }, 50);
    }
  });
}

/**
 * Imposta posizione e dimensioni della finestra WPF.
 */
export async function setBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth?: number,
  viewportHeight?: number,
  viewportDpr?: number,
  sourceWindow?: BrowserWindow | null
): Promise<void> {
  lastBoundsPayload = { x, y, width, height };
  if (viewportWidth && viewportHeight && viewportWidth > 0 && viewportHeight > 0) {
    lastViewportSize = { width: viewportWidth, height: viewportHeight };
  }
  if (viewportDpr && viewportDpr > 0) {
    lastViewportDpr = viewportDpr;
  }

  const win = getHostWindow(sourceWindow);
  const cb = win?.getContentBounds();

  // Invia coordinate DIP assolute sullo schermo (contentBounds + CSS offset).
  // WPF per-monitor V2 le applica direttamente tramite Left/Top/Width/Height,
  // gestendo la conversione DPI internamente. Questo evita il problema di
  // ClientToScreen cross-process che restituisce coordinate in system-DPI space
  // anziché physical space su monitor secondari con DPI diverso dal primario.
  const payload = cb
    ? {
        x: Math.round(cb.x + x),
        y: Math.round(cb.y + y),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        absolute: true,
      }
    : {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      };

  await sendCommandNoAck('SET_BOUNDS', payload);
}

/**
 * Inserisce testo alla posizione corrente del cursore nell'editor WPF.
 */
export async function insertText(text: string): Promise<void> {
  await sendCommand('INSERT_TEXT', { text });
}

/**
 * Imposta il livello di zoom dell'editor WPF (25-400%).
 */
export async function setZoom(zoomPercent: number): Promise<void> {
  await sendCommand('SET_ZOOM', { zoom: zoomPercent });
}

/**
 * Verifica se il processo WPF e' attivo e connesso.
 */
export function isEditorReady(): boolean {
  return isReady && wpfProcess !== null && !wpfProcess.killed;
}

/**
 * Termina il processo WPF.
 */
export function stopWpfEditor(): void {
  setManagerState('stopping');
  if (wpfProcess && !wpfProcess.killed) {
    wpfProcess.kill();
    wpfProcess = null;
  }
  if (pipeClient) {
    pipeClient.destroy();
    pipeClient = null;
  }
  isReady = false;
  isEditorVisible = false;
  lastBoundsPayload = null;
  lastViewportSize = null;
  lastViewportDpr = null;
  hostWindowId = null;
  pendingCallbacks.clear();
  setManagerState('stopped');
}

/**
 * Registra una sessione renderer e assicura che il processo WPF sia disponibile.
 */
export async function attachSession(sessionId: string, sourceWindow?: BrowserWindow | null): Promise<WpfEditorStatus> {
  if (!sessionId || !sessionId.trim()) {
    throw new Error('sessionId mancante');
  }
  activeSessions.add(sessionId.trim());

  try {
    if (!isEditorReady()) {
      await startWpfEditor();
    }
    await setParentWindow(sourceWindow).catch((err: any) => {
      log.warn(`[WPF Editor] setParent fallito in attach: ${err?.message ?? err}`);
    });
    emitStatus();
    return getStatusSnapshot();
  } catch (err: any) {
    setManagerState('faulted', err?.message ?? 'attach_failed');
    throw err;
  }
}

/**
 * Sgancia una sessione renderer. Se non ci sono piu' sessioni attive nasconde l'editor.
 */
export async function detachSession(sessionId: string): Promise<WpfEditorStatus> {
  if (sessionId && sessionId.trim()) {
    activeSessions.delete(sessionId.trim());
  }

  if (activeSessions.size === 0 && isEditorReady() && isEditorVisible) {
    await hideEditor().catch(() => {});
  } else {
    emitStatus();
  }

  return getStatusSnapshot();
}

/**
 * Restituisce lo stato del manager WPF.
 */
export function getStatus(): WpfEditorStatus {
  return getStatusSnapshot();
}

/**
 * Verifica se il documento corrente è stato modificato.
 */
export async function isDirty(): Promise<boolean> {
  return await sendCommand('IS_DIRTY');
}

/**
 * Registra gli IPC handlers per la comunicazione renderer → main → WPF.
 */
export function registerWpfEditorIpcHandlers(): void {
  ipcMain.handle('wpf-editor:start', async () => {
    await startWpfEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:attach', async (e, params: { sessionId: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return await attachSession(params?.sessionId ?? '', win);
  });

  ipcMain.handle('wpf-editor:detach', async (_e, params: { sessionId: string }) => {
    return await detachSession(params?.sessionId ?? '');
  });

  ipcMain.handle('wpf-editor:get-status', async () => {
    return getStatus();
  });

  ipcMain.handle('wpf-editor:load-rtf', async (_e, rtfBase64: string) => {
    await loadRtf(rtfBase64);
    return true;
  });

  ipcMain.handle('wpf-editor:get-rtf', async () => {
    return await getRtf();
  });

  ipcMain.handle('wpf-editor:get-pdf', async () => {
    return await getPdf();
  });

  ipcMain.handle('wpf-editor:is-dirty', async () => {
    return await isDirty();
  });

  ipcMain.handle('wpf-editor:show', async () => {
    await showEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:hide', async () => {
    await hideEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:set-bounds', async (e, bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    viewportWidth?: number;
    viewportHeight?: number;
    viewportDpr?: number;
  }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    await setBounds(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      bounds.viewportWidth,
      bounds.viewportHeight,
      bounds.viewportDpr,
      win
    );
    return true;
  });

  ipcMain.handle('wpf-editor:is-ready', async () => {
    return isEditorReady();
  });

  ipcMain.handle('wpf-editor:set-parent', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    await setParentWindow(win);
    return true;
  });

  ipcMain.handle('wpf-editor:insert-text', async (_e, text: string) => {
    await insertText(text);
    return true;
  });

  ipcMain.handle('wpf-editor:set-zoom', async (_e, zoomPercent: number) => {
    await setZoom(zoomPercent);
    return true;
  });

  ipcMain.handle('wpf-editor:focus', async () => {
    await focusEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:stop', async () => {
    stopWpfEditor();
    return true;
  });
}
