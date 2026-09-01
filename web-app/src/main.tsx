import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/global.css'
import './styles/mobile.css'
import App from './App.tsx'
// Keycloak-гейт (як в ai-agents-ws): без сесії застосунок не рендериться.
// У DEV-режимі AuthGate пропускає без авторизації — локальна розробка
// і тести не потребують бекенда.
import { AuthProvider } from './components/auth/AuthContext.tsx'
import { AuthGate } from './components/auth/AuthGate.tsx'
import { mockProject, mockParts } from './engines/__tests__/mockData';
import { useProjectStore } from './store/useProjectStore';
import { useUIStore } from './store/useStore';

declare global {
  interface Window {
    mockProject: typeof mockProject;
    mockParts: typeof mockParts;
    useProjectStore: typeof useProjectStore;
    useUIStore: typeof useUIStore;
  }
}

if (import.meta.env.DEV) {
  window.mockProject = mockProject;
  window.mockParts = mockParts;
  window.useProjectStore = useProjectStore;
  window.useUIStore = useUIStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
