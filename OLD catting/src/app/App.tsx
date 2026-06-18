import { useEffect } from 'react';
import { HeaderBar } from '../components/HeaderBar';
import { LanguageDomTranslator } from '../components/LanguageDomTranslator';
import { Sidebar } from '../components/Sidebar';
import { SlabCanvas } from '../components/SlabCanvas';
import { StatusBar } from '../components/StatusBar';
import { TextureLayoutPanel } from '../components/TextureLayoutPanel';
import { UnplacedPartsPanel } from '../components/UnplacedPartsPanel';
import { useProjectStore } from '../store/useProjectStore';

export function App() {
  const { initialize, undoLastMovement, redoMovement } = useProjectStore();

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastMovement();
      }
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoMovement();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoMovement, undoLastMovement]);

  return (
    <div className="app-shell">
      <LanguageDomTranslator />
      <HeaderBar />
      <StatusBar />
      <main className="main-layout">
        <Sidebar />
        <div className="workspace">
          <UnplacedPartsPanel />
          <SlabCanvas />
          <TextureLayoutPanel />
        </div>
      </main>
    </div>
  );
}
