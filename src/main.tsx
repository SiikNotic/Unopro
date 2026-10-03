import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles-cz.css';
import { registerAdMobIfNative } from './bank/admobProvider';
import { installErrorReporter } from './app/errorReporter';

// Never run inside another site's frame (clickjacking): GitHub Pages can't send frame-ancestors / X-Frame-Options,
// so the page breaks out itself. Inside the Android app the page is always the top window.
if (window.top && window.top !== window.self) {
  try {
    window.top.location.href = window.location.href;
  } catch {
    document.documentElement.innerHTML = '';
  }
}

// Uncaught errors are reported (anonymously, rate-limited) so crashes on players' devices get fixed.
installErrorReporter();

// Inside the Android app: rewarded ads through AdMob (on the web nothing is loaded).
void registerAdMobIfNative().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
