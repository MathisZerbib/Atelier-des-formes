import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const PWAUpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]">
      <div className="rounded-lg shadow-lg bg-white border px-4 py-3 flex items-center gap-3">
        {offlineReady && (
          <span className="text-sm">Application prête pour une utilisation hors ligne.</span>
        )}
        {needRefresh && (
          <>
            <span className="text-sm">Nouvelle version disponible.</span>
            <button
              className="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm"
              onClick={() => updateServiceWorker(true)}
            >
              Mettre à jour
            </button>
          </>
        )}
        <button
          className="px-3 py-1.5 rounded-md bg-gray-100 text-sm"
          onClick={() => {
            setOfflineReady(false);
            setNeedRefresh(false);
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;
