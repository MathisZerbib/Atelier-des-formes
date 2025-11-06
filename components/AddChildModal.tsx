import React, { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  defaultValue?: string;
  title?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const AddChildModal: React.FC<Props> = ({
  open,
  defaultValue = '',
  title = "Ajouter un enfant",
  label = "Nom de l'enfant",
  placeholder = "Ex: Emma, Lucas...",
  confirmLabel = 'Ajouter',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      // focus input when opening
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => {
    if (loading) return;
    onConfirm(value.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} aria-hidden="true"></div>
      <div role="dialog" aria-modal="true" aria-labelledby="add-child-title" aria-describedby="add-child-desc" className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 z-50">
        <h2 id="add-child-title" className="text-lg font-semibold mb-4">{title}</h2>
        <p id="add-child-desc" className="sr-only">Entrer le nom du nouvel enfant à ajouter à la classe.</p>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="child-name-input">{label}</label>
        <input
          id="child-name-input"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full p-2 border rounded-md mb-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          aria-required="true"
          aria-label="Nom de l'enfant"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 bg-gray-100 rounded-md" aria-label="Annuler l'ajout">{cancelLabel}</button>
          <button
            onClick={submit}
            disabled={loading || !value.trim()}
            className={`px-3 py-2 rounded-md text-white ${loading || !value.trim() ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            aria-busy={loading}
            aria-disabled={loading || !value.trim()}
          >{loading ? 'Ajout...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default AddChildModal;
