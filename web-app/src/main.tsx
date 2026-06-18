import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/global.css'
import App from './App.tsx'
import { AuthProvider } from './components/auth/AuthContext.tsx'
import { mockProject, mockParts } from './engines/__tests__/mockData';
import { useProjectStore } from './store/useProjectStore';

if (import.meta.env.DEV) {
  (window as any).mockProject = mockProject;
  (window as any).mockParts = mockParts;
  (window as any).useProjectStore = useProjectStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
