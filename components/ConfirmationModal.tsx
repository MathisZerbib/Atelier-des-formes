import React from 'react';

interface Props {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<Props> = ({ open, title = 'Confirmer', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', onConfirm, onCancel }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} aria-hidden="true"></div>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 z-50">
        <h2 id="confirm-title" className="text-lg font-semibold mb-2">{title}</h2>
        {message && <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{message}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-gray-100 rounded-md">{cancelLabel}</button>
          <button onClick={onConfirm} className="px-3 py-2 bg-red-500 text-white rounded-md">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
