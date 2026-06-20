import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';
import { X, Bug, Download, Loader2, Camera, CheckCircle } from 'lucide-react';
import { blackbox } from '../../utils/blackbox';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { ticketStore } from '../../utils/bugTickets';

export function BugReporterDialog() {
  const isBugReporterOpen = useUIStore(s => s.isBugReporterOpen);
  const setIsBugReporterOpen = useUIStore(s => s.setIsBugReporterOpen);
  const setIsRecordingBug = useUIStore(s => s.setIsRecordingBug);
  const rrwebEvents = useUIStore(s => s.rrwebEvents);
  
  const project = useProjectStore(s => s.project);
  
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState<{ticketId: string} | null>(null);

  useEffect(() => {
    if (isBugReporterOpen) {
      setIsRecordingBug(false); // Stop recording when dialog opens
      takeScreenshot();
    } else {
      setDescription('');
      setScreenshot(null);
      setIsSuccess(null);
    }
  }, [isBugReporterOpen]);

  const takeScreenshot = async () => {
    try {
      const canvas = await html2canvas(document.body, {
        ignoreElements: (el) => el.classList.contains('bug-reporter-ignore'),
        scale: 1, // lower quality for bug report to save space
        logging: false, // hide internal html2canvas logs
        onclone: (clonedDoc) => {
          // Attempt to remove problematic okclh colors from inline styles if any
          const allElements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i] as HTMLElement;
            if (el.style && el.style.cssText.includes('oklch')) {
              el.style.cssText = el.style.cssText.replace(/oklch\([^)]+\)/g, 'transparent');
            }
          }
        }
      });
      setScreenshot(canvas.toDataURL('image/jpeg', 0.6));
    } catch (e) {
      console.warn('Screenshot failed (often due to modern CSS like oklch):', e);
      // We proceed without screenshot
    }
  };

  const generateReport = async () => {
    setIsProcessing(true);
    try {
      const zip = new JSZip();
      
      // 1. User Description
      zip.file('description.txt', `User Description:\n${description}\n\nTimestamp: ${new Date().toISOString()}`);
      
      // 2. Project State
      const safeProject = { ...project };
      // Omit heavy base64 images from slabs to save space if needed, but for now just export full
      zip.file('project_state.json', JSON.stringify(safeProject, null, 2));
      
      // 3. Console Logs
      const logs = blackbox.getLogs();
      const logsText = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}\n${l.stack || ''}`).join('\n\n');
      zip.file('console_logs.txt', logsText);
      
      // 4. rrweb Events
      if (rrwebEvents && rrwebEvents.length > 0) {
        zip.file('recording.json', JSON.stringify(rrwebEvents));
      }
      
      // 5. Screenshot
      if (screenshot) {
        const base64Data = screenshot.replace(/^data:image\/jpeg;base64,/, "");
        zip.file('screenshot.jpg', base64Data, { base64: true });
      }
      
      // Generate ZIP blob
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Save to local IndexedDB tickets
      const ticket = await ticketStore.addTicket(description, content);
      
      setIsSuccess({ ticketId: ticket.id });
      
    } catch (error) {
      console.error('Failed to generate report', error);
      alert('Помилка відправки звіту.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isBugReporterOpen) return null;

  if (isSuccess) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-8 bug-reporter-ignore">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-8 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-200">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Звіт відправлено!</h2>
          <p className="text-slate-600 mb-6">
            Ваш тікет <strong>#{isSuccess.ticketId}</strong> успішно збережено у базу. Дякуємо за допомогу!
          </p>
          <button 
            onClick={() => setIsBugReporterOpen(false)}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-md transition-colors"
          >
            Закрити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-8 bug-reporter-ignore">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-red-50 shrink-0">
          <div className="flex items-center gap-3 text-red-700">
            <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
              <Bug className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-sans">Повідомити про проблему</h2>
          </div>
          <button 
            onClick={() => setIsBugReporterOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-red-400 hover:text-red-700 hover:bg-red-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col p-6 gap-6">
          <p className="text-slate-600">
            Дякуємо, що допомагаєте зробити SlabCutPlanner кращим! Ми вже автоматично записали ваш екран, стан проєкту та лог помилок. Будь ласка, опишіть словами, що саме пішло не так:
          </p>

          <textarea
            className="w-full h-32 border border-slate-300 rounded-md p-3 text-slate-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
            placeholder="Наприклад: Я намагався перетягнути деталь на сляб, але вона зависла в повітрі і програма перестала реагувати..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex gap-4">
            <div className="w-32 h-20 bg-slate-200 rounded border border-slate-300 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
              {screenshot ? (
                <img src={screenshot} alt="Screenshot" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="flex flex-col justify-center gap-1">
              <h4 className="font-semibold text-slate-700 text-sm">Прикріплені дані:</h4>
              <ul className="text-xs text-slate-500 list-disc list-inside">
                <li>Автоматичний знімок екрану (2D)</li>
                <li>Лог дій мишки (rrweb)</li>
                <li>Системні логи та помилки</li>
                <li>Файл поточного проєкту</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-slate-200 flex items-center justify-end px-6 bg-slate-50 shrink-0 gap-3">
          <button 
            onClick={() => setIsBugReporterOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
          >
            Скасувати
          </button>
          <button 
            onClick={generateReport}
            disabled={isProcessing || description.trim() === ''}
            className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors shadow-sm"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isProcessing ? 'Відправка...' : 'Відправити Звіт'}
          </button>
        </div>

      </div>
    </div>
  );
}
