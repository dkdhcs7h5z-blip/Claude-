import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import App from './App';
import i18n from './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// PWA: prompt-based updates so a clinician never loses an unsaved form to a silent reload.
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm(`${i18n.t('pwa.updateAvailable')} ${i18n.t('pwa.reload')}?`)) void updateSW(true);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
