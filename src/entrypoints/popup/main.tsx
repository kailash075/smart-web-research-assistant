import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppServices } from '@/composition/app-services';
import { AppServicesProvider } from '@/ui/app-services-context';
import { App } from './App';
import './style.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Popup root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppServicesProvider services={createAppServices()}>
      <App />
    </AppServicesProvider>
  </StrictMode>,
);
