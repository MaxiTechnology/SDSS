import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [status, setStatus] = useState('Checking connection…');
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Connection failed');
      const data = await response.json();
      if (data.status !== 'ok') throw new Error('Unexpected response');
      setStatus('Application service connected');
    } catch {
      setStatus('Application service unavailable. Start the backend, then try again.');
    } finally { setChecking(false); }
  }
  useEffect(() => { void check(); }, []);
  return <div className="layout"><aside><strong>SDSS</strong><p>Supplier Decision Support</p><span>Development setup</span></aside><main><small>LOCAL DEMONSTRATION • SYNTHETIC DATA</small><h1>Your SDSS project starts here</h1><p>The application foundation is being prepared.</p><section><h2>Connection check</h2><p role="status">{status}</p><button disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check again'}</button></section><p>Purchasing projects and database saving will be added in the next implementation tasks.</p></main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
