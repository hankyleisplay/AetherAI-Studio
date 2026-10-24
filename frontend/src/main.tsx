import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { I18nProvider } from './i18n/I18nContext';

// Attach the remote-access PIN token to every same-origin API call; the backend enforces it
const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const token = localStorage.getItem('aether_access_token');
    const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (token && isApi) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('x-access-token')) headers.set('x-access-token', token);
      return nativeFetch(input, { ...init, headers });
    }
  } catch {
    // fall through to the untouched request
  }
  return nativeFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
