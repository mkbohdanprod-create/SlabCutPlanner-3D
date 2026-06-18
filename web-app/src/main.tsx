import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/global.css'
import App from './App.tsx'
import { AuthProvider } from './components/auth/AuthContext.tsx'
import { mockProject, mockParts } from './engines/__tests__/mockData';
import { useProjectStore } from './store/useProjectStore';

declare global {
  interface Window {
    mockProject: typeof mockProject;
    mockParts: typeof mockParts;
    useProjectStore: typeof useProjectStore;
  }
}

if (import.meta.env.DEV) {
  window.mockProject = mockProject;
  window.mockParts = mockParts;
  window.useProjectStore = useProjectStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
