import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles-cz.css';
import { registerAdMobIfNative } from './bank/admobProvider';

// Inside the Android app: rewarded ads through AdMob (on the web nothing is loaded).
void registerAdMobIfNative().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
