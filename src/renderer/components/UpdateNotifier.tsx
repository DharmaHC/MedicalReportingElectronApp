// src/renderer/components/UpdateNotifier.tsx
import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    electronAPI: {
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onDownloadProgress: (callback: (progress: any) => void) => void;
    };
  }
}

const UpdateNotifier: React.FC = () => {
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onUpdateAvailable(() => {
        setUpdateMsg('Aggiornamento disponibile: download in corso...');
      });
      window.electronAPI.onDownloadProgress((p) => {
        setProgress(p.percent ? Math.floor(p.percent) : null);
      });
    }
  }, []);

  return updateMsg ? (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: '#e2e8f0',
        color: '#111',
        padding: 20,
        borderRadius: 8,
        boxShadow: '0 2px 8px #0001',
        zIndex: 9999,
      }}
    >
      <div>{updateMsg}</div>
      {progress !== null && (
        <div style={{ marginTop: 8 }}>
          Download: {progress}%
          <div style={{ background: '#ccc', height: 6, borderRadius: 3, marginTop: 4 }}>
            <div
              style={{
                background: '#36c',
                width: `${progress}%`,
                height: '100%',
                borderRadius: 3,
                transition: 'width 0.5s',
              }}
            />
          </div>
        </div>
      )}
    </div>
  ) : null;
};

export default UpdateNotifier;
