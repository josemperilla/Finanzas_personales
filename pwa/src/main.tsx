import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'

// Registro del Service Worker (autogenerado por vite-plugin-pwa con generateSW).
// registerType:'autoUpdate' ya está en vite.config.ts; aquí solo lo activamos.
// El SW habilita el modo instalable de la PWA y el cache offline; no gestiona push
// (los recordatorios de vencimiento usan la Notification API desde el hilo principal).
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// Reload the page when a lazy-loaded chunk fails to fetch (stale SW cache).
window.addEventListener('unhandledrejection', (event) => {
  const msg = (event.reason?.message as string) || '';
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    event.reason?.name === 'ChunkLoadError'
  ) {
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
