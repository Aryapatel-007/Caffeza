import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeProvider.jsx';

/*
 * Fonts are served from our own server (P12). At the cafe, on a 4G backup
 * line, a request to another site is a delay before the till can draw. Only
 * the weights the design uses: Sans 400, 500, 600 and Mono 400 to 700. The
 * family names these register, 'IBM Plex Sans' and 'IBM Plex Mono', are the
 * ones the tokens in index.css already use.
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
/*
 * Version 2, P20A: Anek for every word, variable in weight and width, with its
 * Gujarati and Devanagari siblings for the second-language line. `standard.css`
 * registers both axes (weight 100 to 800, width 75 to 125); `index.css` in the
 * same package would register weight only. Plex Sans above stays until P20B
 * moves the back office.
 */
import '@fontsource-variable/anek-latin/standard.css';
import '@fontsource-variable/anek-gujarati/standard.css';
import '@fontsource-variable/anek-devanagari/standard.css';
import './index.css';

/**
 * Server state lives here.
 *
 * Two settings worth knowing. A 401 is never retried: the API client already
 * refreshes once on TOKEN_EXPIRED, so a 401 reaching react-query means the
 * session is genuinely over and retrying just delays the login screen.
 *
 * Refetch on focus is on because two tablets open on the availability board do
 * not see each other live in v1, and coming back to a tab is the moment to
 * catch up.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
