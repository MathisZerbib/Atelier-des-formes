import React from 'react';

interface Props {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  extraActionLabel?: string;
  onExtraAction?: () => void;
  destructive?: boolean;
}

const ConfirmationModal: React.FC<Props> = ({ open, title = 'Confirmer', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', onConfirm, onCancel, extraActionLabel, onExtraAction, destructive = false }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} aria-hidden="true"></div>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 z-50">
        <button
          aria-label="Fermer"
          onClick={onCancel}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
        >
          ✕
        </button>
        <h2 id="confirm-title" className="text-lg font-semibold mb-2 pr-6">{title}</h2>
        {message && <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{message}</p>}
        <div className="flex justify-between items-center gap-2">
          {extraActionLabel && onExtraAction ? (
            <button onClick={onExtraAction} className="px-3 py-2 bg-gray-50 border rounded-md text-gray-700 hover:bg-gray-100">
              {extraActionLabel}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-2 bg-gray-100 rounded-md">{cancelLabel}</button>
            <button onClick={onConfirm} className={`px-3 py-2 rounded-md text-white ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
