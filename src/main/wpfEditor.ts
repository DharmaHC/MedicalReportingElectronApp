/**
 * WPF RadRichTextEditor companion process manager.
 *
 * Lifecycle is managed in main process with explicit states and session attach/detach.
 * Protocol: newline-delimited JSON over a Named Pipe.
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

const PIPE_PREFIX = '\\\\.\\pipe\\';
const IDLE_STOP_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const HEARTBEAT_MAX_FAILURES = 3;

type WpfLifecycleState =
  | 'stopped'
  | 'starting'
  | 'ready_hidden'
  | 'ready_visible'
  | 'stopping'
  | 'faulted';

interface WpfStatusPayload {
  state: WpfLifecycleState;
  isReady: boolean;
  isVisible: boolean;
  activeSessions: number;
  reason?: string;
}

let wpfProcess: ChildProcess | null = null;
let pipeClient: net.Socket | null = null;
let pipeName = '';
let isReady = false;
let isEditorVisible = false;
let lifecycleState: WpfLifecycleState = 'stopped';
let activeSessions = new Set<string>();

let readyResolve: (() => void) | null = null;
let messageBuffer = '';
let startupPromise: Promise<void> | null = null;
let shutdownInProgress = false;
let stopPromise: Promise<void> | null = null;

let windowListenersSetup = false;
let lastCssBounds: { x: number; y: number; width: number; height: number } | null = null;
let lastViewportSize: { width: number; height: number } | null = null;
let lastViewportDpr: number | null = null;

let idleStopTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatFailures = 0;

let commandChain: Promise<void> = Promise.resolve();

const pendingCallbacks: Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: ReturnType<typeof setTimeout>;
  }
> = new Map();

function setState(next: WpfLifecycleState, reason?: string): void {
  if (lifecycleState === next) {
    if (reason) emitStatus(reason);
    return;
  }
  lifecycleState = next;
  emitStatus(reason);
}

function getStatusPayload(reason?: string): WpfStatusPayload {
  return {
    state: lifecycleState,
    isReady,
    isVisible: isEditorVisible,
    activeSessions: activeSessions.size,
    reason,
  };
}

function emitStatus(reason?: string): void {
  const payload = getStatusPayload(reason);
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('wpf-editor:status', payload);
    } catch {
      // no-op
    }
  }
}

function enqueue<T>(label: string, task: () => Promise<T>): Promise<T> {
  const wrapped = commandChain.then(task, task);
  commandChain = wrapped.then(
    () => undefined,
    () => undefined
  );

  return wrapped.catch((err) => {
    log.error(`[WPF Editor] Queue task failed (${label}): ${err?.message || err}`);
    throw err;
  });
}

function clearIdleStopTimer(): void {
  if (idleStopTimer) {
    clearTimeout(idleStopTimer);
    idleStopTimer = null;
  }
}

function scheduleIdleStop(): void {
  clearIdleStopTimer();
  idleStopTimer = setTimeout(() => {
    if (activeSessions.size === 0) {
      void stopWpfEditorAsync('idle_timeout');
    }
  }, IDLE_STOP_MS);
}

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatFailures = 0;
}

function startHeartbeat(): void {
  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!isReady || lifecycleState === 'stopping' || lifecycleState === 'stopped') return;

    void enqueue('heartbeat', async () => {
      try {
        await sendCommandDirect('PING', undefined, HEARTBEAT_TIMEOUT_MS);
        heartbeatFailures = 0;
      } catch (err: any) {
        heartbeatFailures += 1;
        log.warn(`[WPF Editor] Heartbeat failed (${heartbeatFailures}/${HEARTBEAT_MAX_FAILURES}): ${err?.message || err}`);
        if (heartbeatFailures >= HEARTBEAT_MAX_FAILURES) {
          setState('faulted', 'heartbeat_failed');
          await stopWpfEditorAsync('heartbeat_failed');
        }
      }
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function rejectPendingCallbacks(reason: string): void {
  for (const [id, cb] of pendingCallbacks) {
    clearTimeout(cb.timer);
    cb.reject(new Error(reason));
  }
  pendingCallbacks.clear();
}

function hardCleanupRuntime(reason: string): void {
  clearIdleStopTimer();
  clearHeartbeat();

  if (pipeClient) {
    try {
      pipeClient.destroy();
    } catch {
      // no-op
    }
    pipeClient = null;
  }

  if (wpfProcess && !wpfProcess.killed) {
    try {
      wpfProcess.kill();
    } catch {
      // no-op
    }
  }

  wpfProcess = null;
  isReady = false;
  isEditorVisible = false;
  startupPromise = null;
  readyResolve = null;
  messageBuffer = '';
  lastCssBounds = null;
  lastViewportSize = null;
  lastViewportDpr = null;
  activeSessions.clear();
  rejectPendingCallbacks(reason);
}

/**
 * Restituisce il path dell'eseguibile WPF.
 */
function getWpfExePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'wpf-editor', 'MedReportEditor.exe');
  }
  return path.join(
    __dirname,
    '..', '..', 'MedReportEditor.Wpf', 'bin', 'Debug', 'net8.0-windows', 'MedReportEditor.exe'
  );
}

function waitForReady(timeoutMs: number): Promise<void> {
  if (isReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      readyResolve = null;
      reject(new Error(`WPF Editor READY timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    readyResolve = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

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
            if (messageBuffer.length === 0 && text.charCodeAt(0) === 0xfeff) {
              text = text.substring(1);
            }
            messageBuffer += text;
            processMessageBuffer();
          });

          client.on('end', () => {
            log.info('[WPF Editor] Pipe disconnesso');
            pipeClient = null;
            isReady = false;
            if (!shutdownInProgress) {
              setState('faulted', 'pipe_disconnected');
            }
          });

          client.on('error', (err) => {
            log.error(`[WPF Editor] Errore pipe: ${err.message}`);
          });

          resolve();
        });

        client.on('error', (err) => reject(err));
      });

      log.info(`[WPF Editor] Connesso al pipe ${pipePath}`);
      return;
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`Impossibile connettersi al pipe ${pipePath} dopo ${maxRetries} tentativi`);
}

function processMessageBuffer(): void {
  const lines = messageBuffer.split('\n');
  messageBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch {
      log.error(`[WPF Editor] JSON parse error: ${line}`);
    }
  }
}

function handleMessage(msg: any): void {
  if (msg.type === 'READY') {
    isReady = true;
    setState(isEditorVisible ? 'ready_visible' : 'ready_hidden', 'ready');
    if (readyResolve) {
      readyResolve();
      readyResolve = null;
    }
    return;
  }

  if (msg.type === 'OK' && msg.command) {
    const cb = pendingCallbacks.get(msg.command);
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete(msg.command);
      cb.resolve(msg);
    }
    return;
  }

  if (msg.type === 'RTF_CONTENT') {
    const cb = pendingCallbacks.get('GET_RTF');
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete('GET_RTF');
      cb.resolve(msg.data);
    }
    return;
  }

  if (msg.type === 'PDF_CONTENT') {
    const cb = pendingCallbacks.get('GET_PDF');
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete('GET_PDF');
      cb.resolve(msg.data);
    }
    return;
  }

  if (msg.type === 'IS_DIRTY') {
    const cb = pendingCallbacks.get('IS_DIRTY');
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete('IS_DIRTY');
      cb.resolve(Boolean(msg.dirty));
    }
    return;
  }

  if (msg.type === 'PONG') {
    const cb = pendingCallbacks.get('PING');
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete('PING');
      cb.resolve(true);
    }
    return;
  }

  if (msg.type === 'ERROR') {
    log.error(`[WPF Editor] Errore: ${msg.message}`);
    const first = pendingCallbacks.entries().next().value;
    if (first) {
      const [id, cb] = first;
      clearTimeout(cb.timer);
      pendingCallbacks.delete(id);
      cb.reject(new Error(msg.message));
    }
  }
}

function sendCommandDirect(command: string, data?: any, timeoutMs = 30_000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!pipeClient || !isReady) {
      reject(new Error('WPF Editor non connesso'));
      return;
    }

    if (pendingCallbacks.has(command)) {
      reject(new Error(`Comando ${command} gia' pendente`));
      return;
    }

    const timer = setTimeout(() => {
      const current = pendingCallbacks.get(command);
      if (current && current.timer === timer) {
        pendingCallbacks.delete(command);
        reject(new Error(`Timeout comando ${command}`));
      }
    }, timeoutMs);

    pendingCallbacks.set(command, { resolve, reject, timer });

    const msg = data ? { command, ...data } : { command };
    const json = JSON.stringify(msg) + '\n';

    pipeClient.write(json, 'utf-8', (err) => {
      if (!err) return;

      const current = pendingCallbacks.get(command);
      if (current && current.timer === timer) {
        clearTimeout(timer);
        pendingCallbacks.delete(command);
        reject(err);
      }
    });
  });
}

async function ensureProcessStarted(): Promise<void> {
  if (isReady && wpfProcess && !wpfProcess.killed) {
    return;
  }

  if (stopPromise) {
    await stopPromise;
  }

  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    setState('starting', 'start_requested');
    pipeName = `MedReportEditor_${process.pid}_${Date.now()}`;

    const exePath = getWpfExePath();
    log.info(`[WPF Editor] Avvio: ${exePath} --pipe ${pipeName}`);

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

      const stopping = lifecycleState === 'stopping' || shutdownInProgress;
      hardCleanupRuntime('WPF process exited');

      if (stopping) {
        setState('stopped', 'process_exit');
      } else {
        setState('faulted', 'process_exit');
      }
    });

    await connectToPipe(pipeName);
    await waitForReady(15_000);
    setupWindowListeners();
    startHeartbeat();
    setState('ready_hidden', 'started');
  })()
    .catch((err) => {
      hardCleanupRuntime(err?.message || 'startup_error');
      setState('faulted', 'startup_error');
      throw err;
    })
    .finally(() => {
      startupPromise = null;
    });

  return startupPromise;
}

export async function startWpfEditor(): Promise<void> {
  clearIdleStopTimer();
  await ensureProcessStarted();
}

export async function stopWpfEditorAsync(reason = 'manual_stop'): Promise<void> {
  if (lifecycleState === 'stopped') {
    return;
  }

  if (stopPromise) {
    return stopPromise;
  }

  setState('stopping', reason);
  shutdownInProgress = true;

  stopPromise = enqueue('stop', async () => {
    hardCleanupRuntime(reason);
    setState('stopped', reason);
  }).finally(() => {
    shutdownInProgress = false;
    stopPromise = null;
  });

  await stopPromise;
}

export function stopWpfEditor(): void {
  shutdownInProgress = true;
  setState('stopping', 'sync_stop');
  hardCleanupRuntime('sync_stop');
  setState('stopped', 'sync_stop');
  stopPromise = null;
  shutdownInProgress = false;
}

export async function attachSession(sessionId: string): Promise<WpfStatusPayload> {
  const sid = sessionId?.trim();
  if (!sid) {
    throw new Error('sessionId obbligatorio per attach');
  }

  activeSessions.add(sid);
  clearIdleStopTimer();

  await ensureProcessStarted();
  await setParentWindow();
  await showEditor();

  return getStatusPayload('attach');
}

export async function detachSession(sessionId: string): Promise<WpfStatusPayload> {
  const sid = sessionId?.trim();
  if (sid) {
    activeSessions.delete(sid);
  }

  if (activeSessions.size === 0 && isReady) {
    await hideEditor();
    scheduleIdleStop();
  }

  return getStatusPayload('detach');
}

export async function setParentWindow(): Promise<void> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    log.warn('[WPF Editor] Nessuna BrowserWindow trovata per setParent');
    return;
  }

  const hwndBuf = win.getNativeWindowHandle();
  const hwnd =
    hwndBuf.length >= 8
      ? hwndBuf.readBigInt64LE(0).toString()
      : hwndBuf.readInt32LE(0).toString();

  await enqueue('SET_PARENT', async () => {
    await sendCommandDirect('SET_PARENT', { hwnd });
  });
}

export async function loadRtf(rtfBase64: string): Promise<void> {
  await enqueue('LOAD_RTF', async () => {
    await sendCommandDirect('LOAD_RTF', { data: rtfBase64 });
  });
}

export async function getRtf(): Promise<string> {
  return enqueue('GET_RTF', async () => await sendCommandDirect('GET_RTF'));
}

export async function getPdf(): Promise<string> {
  return enqueue('GET_PDF', async () => await sendCommandDirect('GET_PDF'));
}

export async function isDocumentDirty(): Promise<boolean> {
  return enqueue('IS_DIRTY', async () => await sendCommandDirect('IS_DIRTY'));
}

export async function showEditor(): Promise<void> {
  await enqueue('SHOW', async () => {
    await sendCommandDirect('SHOW');
  });
  isEditorVisible = true;
  setState('ready_visible', 'show');
}

export async function hideEditor(): Promise<void> {
  await enqueue('HIDE', async () => {
    await sendCommandDirect('HIDE');
  });
  isEditorVisible = false;
  setState('ready_hidden', 'hide');
}

export async function focusEditor(): Promise<void> {
  if (!isReady || !isEditorVisible) return;
  await enqueue('FOCUS', async () => {
    await sendCommandDirect('FOCUS');
  });
}

function setupWindowListeners(): void {
  if (windowListenersSetup) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  windowListenersSetup = true;

  let movePending = false;
  win.on('move', () => {
    if (!isEditorVisible || !isReady || !lastCssBounds || movePending) return;

    movePending = true;
    setTimeout(() => {
      movePending = false;
      if (isEditorVisible && isReady && lastCssBounds) {
        void setBounds(
          lastCssBounds.x,
          lastCssBounds.y,
          lastCssBounds.width,
          lastCssBounds.height,
          lastViewportSize?.width,
          lastViewportSize?.height,
          lastViewportDpr ?? undefined
        );
      }
    }, 30);
  });

  win.on('focus', () => {
    if (!isEditorVisible || !isReady) return;
    setTimeout(() => {
      void focusEditor();
    }, 50);
  });
}

export async function setBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth?: number,
  viewportHeight?: number,
  viewportDpr?: number
): Promise<void> {
  lastCssBounds = { x, y, width, height };
  if (viewportWidth && viewportHeight && viewportWidth > 0 && viewportHeight > 0) {
    lastViewportSize = { width: viewportWidth, height: viewportHeight };
  }
  if (viewportDpr && viewportDpr > 0) {
    lastViewportDpr = viewportDpr;
  }

  const win = BrowserWindow.getAllWindows()[0];
  const cb = win?.getContentBounds();
  let payload: { x: number; y: number; width: number; height: number; absolute: boolean };

  if (cb && (lastViewportSize?.width ?? 0) > 0 && (lastViewportSize?.height ?? 0) > 0) {
    const vpW = lastViewportSize!.width;
    const vpH = lastViewportSize!.height;
    const dpr = lastViewportDpr && lastViewportDpr > 0 ? lastViewportDpr : 1;

    // Alcuni ambienti riportano viewport in CSS px, altri in physical px.
    // Calcola due scale candidate e usa quella piu' vicina a 1 (DIP expected).
    const rawSx = cb.width / vpW;
    const rawSy = cb.height / vpH;
    const dprSx = (cb.width * dpr) / vpW;
    const dprSy = (cb.height * dpr) / vpH;

    const sx = Math.abs(dprSx - 1) < Math.abs(rawSx - 1) ? dprSx : rawSx;
    const sy = Math.abs(dprSy - 1) < Math.abs(rawSy - 1) ? dprSy : rawSy;

    payload = {
      x: cb.x + x * sx,
      y: cb.y + y * sy,
      width: width * sx,
      height: height * sy,
      absolute: true,
    };
  } else if (cb) {
    payload = {
      x: cb.x + x,
      y: cb.y + y,
      width,
      height,
      absolute: true,
    };
  } else {
    payload = { x, y, width, height, absolute: false };
  }

  await enqueue('SET_BOUNDS', async () => {
    await sendCommandDirect('SET_BOUNDS', payload);
  });
}

export async function insertText(text: string): Promise<void> {
  await enqueue('INSERT_TEXT', async () => {
    await sendCommandDirect('INSERT_TEXT', { text });
  });
}

export async function setZoom(zoomPercent: number): Promise<void> {
  await enqueue('SET_ZOOM', async () => {
    await sendCommandDirect('SET_ZOOM', { zoom: zoomPercent });
  });
}

export function isEditorReady(): boolean {
  return isReady && wpfProcess !== null && !wpfProcess.killed;
}

export function getWpfEditorStatus(): WpfStatusPayload {
  return getStatusPayload();
}

export function registerWpfEditorIpcHandlers(): void {
  ipcMain.handle('wpf-editor:start', async () => {
    await startWpfEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:attach', async (_e, params: { sessionId: string }) => {
    return await attachSession(params?.sessionId);
  });

  ipcMain.handle('wpf-editor:detach', async (_e, params: { sessionId: string }) => {
    return await detachSession(params?.sessionId);
  });

  ipcMain.handle('wpf-editor:get-status', async () => {
    return getWpfEditorStatus();
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
    return await isDocumentDirty();
  });

  ipcMain.handle('wpf-editor:show', async () => {
    await showEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:hide', async () => {
    await hideEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:set-bounds', async (_e, bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    viewportWidth?: number;
    viewportHeight?: number;
    viewportDpr?: number;
  }) => {
    await setBounds(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      bounds.viewportWidth,
      bounds.viewportHeight,
      bounds.viewportDpr
    );
    return true;
  });

  ipcMain.handle('wpf-editor:is-ready', async () => {
    return isEditorReady();
  });

  ipcMain.handle('wpf-editor:set-parent', async () => {
    await setParentWindow();
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
    await stopWpfEditorAsync('ipc_stop');
    return true;
  });
}
