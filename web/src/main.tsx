import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applySkinBootstrap } from './theme/bootstrap';
import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';

// Must run before the first render so useSkin()'s initial state read (in
// every PixelShell/ConfigPage instance) sees the persisted skin/theme
// instead of the no-attribute-set default. See theme/bootstrap.ts for why
// this isn't an inline <script> in index.html.
applySkinBootstrap();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
