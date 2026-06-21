import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'

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
