import React, { useEffect, useState } from 'react';
import { migrateIdbToLocalStorage, needsIdbToLocalMigration, type MigrationResult, buildIdbExportPayload, hasIdbData, hasNonEmptyIdbData, clearAllDataAndStartFresh } from '../storage';
import ConfirmationModal from './ConfirmationModal';

const MigrateStorage: React.FC = () => {
  const [needs, setNeeds] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [n, nonEmpty] = await Promise.all([
        needsIdbToLocalMigration(),
        hasNonEmptyIdbData(),
      ]);
      if (mounted) setNeeds(n && nonEmpty);
      const hx = await hasIdbData();
      if (mounted) setCanExport(hx);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const doMigrate = async (force = false) => {
    setBusy(true);
    try {
      const r = await migrateIdbToLocalStorage(force ? { forceOverwrite: true } : undefined);
      setResult(r);
      if (r.status === 'ok' || r.status === 'noop') setNeeds(false);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (!needs && !result) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-[90%] sm:w-96">
      {needs && (
        <div className="relative bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-lg p-4 shadow">
          <button
            className="absolute top-2 right-2 text-yellow-900/70 hover:text-yellow-900"
            aria-label="Fermer"
            onClick={() => setNeeds(false)}
          >
            ✕
          </button>
          <h3 className="pr-6 text-base font-semibold mb-1">Migration de données disponible</h3>
          <div className="text-sm mb-3 space-y-2">
            <p>
              Des données ont été trouvées dans votre navigateur (IndexedDB). Vous pouvez les migrer en toute sécurité vers le stockage local (<span className="font-semibold">localStorage</span>).
            </p>
            {/* <div className="bg-yellow-100/60 border border-yellow-300/70 rounded p-2">
              <p className="font-medium mb-1">Ce que fait la migration :</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Copie vos données d’IndexedDB vers localStorage.</li>
                <li>Crée une <span className="font-semibold">sauvegarde</span> avant d’écrire.</li>
                <li>Vérifie l’intégrité après écriture.</li>
                <li>Vide IndexedDB uniquement si tout est OK.</li>
              </ul>
            </div> */}
            <div className="bg-white/60 border border-yellow-200 rounded p-2">
              <p className="font-medium mb-1">Important à savoir sur le stockage :</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Les données sont <span className="font-semibold">propres à cet appareil et ce navigateur</span>.</li>
                <li>Il n’y a <span className="font-semibold">pas de synchronisation</span> automatique entre vos appareils.</li>
                <li>Si vous utilisez l’application ailleurs (autre ordinateur/téléphone ou autre navigateur), ces données n’y seront pas disponibles.</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              className="px-3 py-2 rounded-md bg-white border text-red-600 hover:bg-red-50 disabled:opacity-50"
              disabled={busy}
              onClick={() => setConfirmResetOpen(true)}
              title="Effacer toutes les données et recréer une classe vierge"
            >
             Nouvelle classe
            </button>
            <button
              className="px-3 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              Migrer maintenant
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={
            'mt-3 rounded-lg p-4 shadow border ' +
            (result.status === 'ok'
              ? 'bg-green-50 border-green-300 text-green-900'
              : result.status === 'conflict'
              ? 'bg-orange-50 border-orange-300 text-orange-900'
              : result.status === 'noop'
              ? 'bg-gray-50 border-gray-300 text-gray-800'
              : 'bg-red-50 border-red-300 text-red-900')
          }
        >
          <div className="flex justify-between items-start gap-3">
            <div className="text-sm">
              <p>{result.message}</p>
              {result.status === 'conflict' && (
                <div className="mt-2">
                  <button
                    className="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white"
                    onClick={() => doMigrate(true)}
                  >
                    Forcer l'écrasement
                  </button>
                </div>
              )}
            </div>
            <button className="text-xs text-gray-600 hover:text-gray-900" onClick={() => setResult(null)} aria-label="Fermer">✕</button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={confirmOpen}
        title="Migrer les données vers le stockage local ?"
        message={
          "Cette action copiera vos données d'IndexedDB vers localStorage avec vérification et sauvegarde, puis videra IndexedDB. Confirmez-vous ?"
        }
        confirmLabel={busy ? 'Migration…' : 'Oui, migrer'}
        cancelLabel="Annuler"
        onConfirm={() => doMigrate()}
        extraActionLabel="Forcer (écraser)"
        onExtraAction={() => doMigrate(true)}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmationModal
        open={confirmResetOpen}
        title="Réinitialiser toutes les données ?"
        message={
          "Cette action va effacer toutes les données et créer une classe vierge.\n\nConseil: vous pouvez d'abord télécharger une sauvegarde."
        }
        confirmLabel={busy ? 'Réinitialisation…' : 'Tout effacer'}
        cancelLabel="Annuler"
        destructive
        extraActionLabel="Télécharger une sauvegarde"
        onExtraAction={async () => {
          try {
            const payload = await buildIdbExportPayload();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `atelier-classrooms-idb-backup-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (e) {
            console.error(e);
            setResult({ status: 'error', message: "Export impossible. Voir la console pour les détails." });
          }
        }}
        onConfirm={async () => {
          setBusy(true);
          try {
            const res = await clearAllDataAndStartFresh('Classe 1');
            if (res.status !== 'ok') {
              setResult(res);
            }
            setConfirmResetOpen(false);
            // Refresh UI to reflect clean state
            window.location.reload();
          } catch (e) {
            console.error(e);
            setResult({ status: 'error', message: "Échec de la réinitialisation. Voir la console." });
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
};

export default MigrateStorage;
