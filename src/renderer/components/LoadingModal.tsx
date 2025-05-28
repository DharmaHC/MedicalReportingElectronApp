import React from "react";
import "./LoadingModal.css";

interface LoadingModalProps {
  isLoading: boolean;
}

const LoadingModal: React.FC<LoadingModalProps> = ({ isLoading }) => {
  if (!isLoading) return null;

  return (
    <div className="loading-modal-overlay">
      <div className="loading-modal-content">
        <div className="spinner"></div>
        <p>Caricamento in Corso...</p>
      </div>
    </div>
  );
};

export default LoadingModal;
