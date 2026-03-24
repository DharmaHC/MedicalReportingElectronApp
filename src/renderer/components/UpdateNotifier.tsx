// src/renderer/components/UpdateNotifier.tsx
import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    electronAPI: {
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: () => void) => void;
      onUpdatePostponed: (callback: () => void) => void;
    };
  }
}

const UpdateNotifier: React.FC = () => {
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable(() => {
      setUpdateMsg('Aggiornamento disponibile: download in corso...');
    });
    window.electronAPI.onDownloadProgress((p) => {
      setProgress(p.percent ? Math.floor(p.percent) : null);
    });
    // Download finished → native install dialog will appear; dismiss the overlay
    window.electronAPI.onUpdateDownloaded(() => {
      setUpdateMsg(null);
      setProgress(null);
    });
    // User clicked "Più tardi" → dismiss the overlay
    window.electronAPI.onUpdatePostponed(() => {
      setUpdateMsg(null);
      setProgress(null);
    });
  }, []);

  if (!updateMsg) return null;

  return (
    // Full-screen semi-transparent overlay that blocks all UI interaction
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.45)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          color: '#111',
          padding: '32px 40px',
          borderRadius: 10,
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          minWidth: 320,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{updateMsg}</div>
        {progress !== null && (
          <div>
            <div style={{ marginBottom: 6 }}>Download: {progress}%</div>
            <div style={{ background: '#e2e8f0', height: 8, borderRadius: 4 }}>
              <div
                style={{
                  background: '#3366cc',
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 4,
                  transition: 'width 0.5s',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateNotifier;
