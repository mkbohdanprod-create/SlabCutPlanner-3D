import React, { useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { X, Wrench, Bug, Calculator, Cpu, Upload, PlaySquare, FileJson, Image as ImageIcon, Ticket, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { useProjectStore } from '../../store/useProjectStore';
import { ticketStore } from '../../utils/bugTickets';
import type { BugTicket } from '../../utils/bugTickets';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

type ServiceSection = 'main' | 'math' | 'render' | 'bugs' | 'tickets' | 'player';

export function ServiceDialog() {
  const isServiceOpen = useUIStore(s => s.isServiceOpen);
  const setIsServiceOpen = useUIStore(s => s.setIsServiceOpen);
  const loadProject = useProjectStore(s => s.loadProject);
  const [activeSection, setActiveSection] = useState<ServiceSection>('main');
  const [uploadedReport, setUploadedReport] = useState<{
    description: string;
    logs: string;
    screenshot: string | null;
    projectState: any;
    recording: any[] | null;
  } | null>(null);

  const playerRef = React.useRef<HTMLDivElement>(null);
  const rrwebInstanceRef = React.useRef<any>(null);

  const [tickets, setTickets] = useState<BugTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  React.useEffect(() => {
    if (activeSection === 'tickets') {
      loadTickets();
    }
  }, [activeSection, isServiceOpen]);

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    const data = await ticketStore.getTickets();
    setTickets(data);
    setIsLoadingTickets(false);
  };

  const loadTicketIntoPlayer = async (ticket: BugTicket) => {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(ticket.zipBlob);
      
      let description = '';
      let logs = '';
      let screenshot = null;
      let projectState = null;
      let recording = null;

      if (contents.file('description.txt')) {
        description = await contents.file('description.txt')!.async('string');
      }
      if (contents.file('console_logs.txt')) {
        logs = await contents.file('console_logs.txt')!.async('string');
      }
      if (contents.file('screenshot.jpg')) {
        const base64 = await contents.file('screenshot.jpg')!.async('base64');
        screenshot = `data:image/jpeg;base64,${base64}`;
      }
      if (contents.file('project_state.json')) {
        const jsonString = await contents.file('project_state.json')!.async('string');
        projectState = JSON.parse(jsonString);
      }
      if (contents.file('recording.json')) {
        const jsonString = await contents.file('recording.json')!.async('string');
        recording = JSON.parse(jsonString);
      }

      setUploadedReport({ description, logs, screenshot, projectState, recording });
      setActiveSection('player');
    } catch (error) {
      console.error('Failed to load ticket', error);
      alert('Помилка завантаження тікета');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      
      let description = '';
      let logs = '';
      let screenshot = null;
      let projectState = null;
      let recording = null;

      if (contents.file('description.txt')) {
        description = await contents.file('description.txt')!.async('string');
      }
      if (contents.file('console_logs.txt')) {
        logs = await contents.file('console_logs.txt')!.async('string');
      }
      if (contents.file('screenshot.jpg')) {
        const base64 = await contents.file('screenshot.jpg')!.async('base64');
        screenshot = `data:image/jpeg;base64,${base64}`;
      }
      if (contents.file('project_state.json')) {
        const jsonString = await contents.file('project_state.json')!.async('string');
        projectState = JSON.parse(jsonString);
      }
      if (contents.file('recording.json')) {
        const jsonString = await contents.file('recording.json')!.async('string');
        recording = JSON.parse(jsonString);
      }

      setUploadedReport({ description, logs, screenshot, projectState, recording });
    } catch (error) {
      console.error('Failed to parse zip', error);
      alert('Помилка читання архіву.');
    }
  };

  React.useEffect(() => {
    if (activeSection === 'player' && uploadedReport?.recording && playerRef.current) {
      if (rrwebInstanceRef.current) return; // already initialized
      
      try {
        const PlayerClass = (rrwebPlayer as any).default || rrwebPlayer;
        console.log('Init rrweb player with events:', uploadedReport.recording.length, 'PlayerClass:', PlayerClass);
        if (uploadedReport.recording.length < 2) {
           console.warn('Not enough events to play');
        }
        rrwebInstanceRef.current = new PlayerClass({
          target: playerRef.current,
          props: {
            events: uploadedReport.recording,
            autoPlay: false,
            width: 800,
            height: 450, // 16:9 ratio
          },
        });
      } catch (err) {
        console.error('rrweb player init failed:', err);
      }
    }
    
    // Cleanup player when closing or changing reports
    return () => {
      if (rrwebInstanceRef.current) {
        // Unfortunately rrwebPlayer doesn't have a clean destroy method in its types usually, 
        // but we can clear innerHTML
        if (playerRef.current) {
          playerRef.current.innerHTML = '';
        }
        rrwebInstanceRef.current = null;
      }
    };
  }, [activeSection, uploadedReport]);

  if (!isServiceOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 text-slate-800">
            <div className="w-8 h-8 bg-[#0084ff] rounded-md flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold font-sans">Сервіс та Відомі проблеми</h2>
          </div>
          <button 
            onClick={() => setIsServiceOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-200 bg-slate-50/50 p-4 overflow-y-auto flex flex-col gap-1 shrink-0">
            <button 
              onClick={() => setActiveSection('main')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'main' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Wrench className="w-4 h-4" />
              Головна
            </button>
            <button 
              onClick={() => setActiveSection('math')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'math' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Calculator className="w-4 h-4" />
              Математика
            </button>
            <button 
              onClick={() => setActiveSection('render')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'render' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Cpu className="w-4 h-4" />
              Рендер та 3D
            </button>
            <button 
              onClick={() => setActiveSection('bugs')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'bugs' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Bug className="w-4 h-4" />
              Відомі баги
            </button>
            <div className="h-px bg-slate-200 my-2"></div>
            <button 
              onClick={() => setActiveSection('tickets')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'tickets' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Ticket className="w-4 h-4" />
              Тікети (Баги)
            </button>
            <button 
              onClick={() => setActiveSection('player')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'player' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <PlaySquare className="w-4 h-4" />
              Аналіз звітів (.zip)
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-white p-8">
            <div className="max-w-3xl">
              {activeSection === 'main' && (
                <div className="space-y-6">
                  <h1 className="text-2xl font-bold text-slate-800 border-b pb-4">Сервісна інформація (Beta)</h1>
                  <p className="text-slate-600 leading-relaxed">
                    Це спеціальний розділ для фіксації складних технічних проблем, алгоритмічних збоїв та відомих багів SlabCutPlanner.
                    Оскільки програма знаходиться у стадії бета-тестування, деякі математичні розрахунки (наприклад, складні перетини багатокутників) можуть працювати не ідеально. 
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Ми фіксуємо ці проблеми тут, щоб ви знали про них і могли їх уникати, поки ми готуємо глобальне архітектурне оновлення для їх виправлення.
                  </p>
                </div>
              )}

              {activeSection === 'math' && (
                <div className="space-y-6">
                  <h1 className="text-2xl font-bold text-slate-800 border-b pb-4">Математика та Алгоритми пакування</h1>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-800">Перетин складних підворотів</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">
                      Поточний алгоритм розбиття (`geometry.ts`) розраховує підвороти як плоскі прямокутники. При дуже гострих кутах зрізу стільниці (менше 45 градусів) полігони підворотів можуть некоректно генерувати координати і перетинатися один з одним на слябі.
                    </p>
                    <div className="text-xs bg-yellow-50 text-yellow-800 px-3 py-2 rounded">
                      <strong>Рішення на зараз:</strong> Уникати додавання автоматичних підворотів для дуже гострих кутів. Створювати їх вручну як окремі деталі.
                    </div>
                  </div>

                </div>
              )}

              {activeSection === 'render' && (
                <div className="space-y-6">
                  <h1 className="text-2xl font-bold text-slate-800 border-b pb-4">3D Рендер та Візуалізація</h1>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-800">Накладання текстури на фаски</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">
                      Оскільки 3D-модель екструдується з 2D-полігонів через `ExtrudeGeometry`, текстура на торцях зараз генерується через проєкцію. При складних вирізах мийок текстура всередині вирізу може розтягуватися.
                    </p>
                    <div className="text-xs bg-blue-50 text-blue-800 px-3 py-2 rounded">
                      <strong>Рішення на зараз:</strong> Очікується впровадження кастомного UV-мапінгу або перехід на шейдери для кращого відображення кромок у Задачі #1 (Фаски та зрізи 3D).
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'bugs' && (
                <div className="space-y-6">
                  <h1 className="text-2xl font-bold text-red-600 border-b border-red-100 pb-4">Відомі баги</h1>
                  
                  <div className="bg-red-50 border border-red-200 rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                        <Bug className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-800">Кеш Web Worker'а</h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      У рідкісних випадках, при видаленні сляба, алгоритм автоматичного пакування може на мить "підвиснути", оскільки старий стейт ще опрацьовується у фоновому потоці. Це не ламає програму, але деталі можуть на секунду повернутися у "Нерозміщені".
                    </p>
                  </div>
                </div>
              )}

              {activeSection === 'tickets' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <h1 className="text-2xl font-bold text-slate-800">Тікети від користувачів</h1>
                    <button onClick={loadTickets} className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-medium">
                      Оновити список
                    </button>
                  </div>

                  {isLoadingTickets ? (
                    <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                  ) : tickets.length === 0 ? (
                    <div className="text-center p-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                      <Ticket className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      Немає нових тікетів
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tickets.map(ticket => (
                        <div key={ticket.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">#{ticket.id}</span>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${ticket.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                {ticket.status === 'pending' ? 'Очікує на обробку' : 'Вирішено'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(ticket.timestamp).toLocaleString('uk-UA')}
                            </div>
                          </div>
                          
                          <p className="text-sm text-slate-700 mb-4 font-medium line-clamp-2">
                            {ticket.description}
                          </p>

                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            <button 
                              onClick={() => loadTicketIntoPlayer(ticket)}
                              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-sm font-medium transition-colors"
                            >
                              <PlaySquare className="w-4 h-4" />
                              Відкрити в Плеєрі
                            </button>
                            <button 
                              onClick={() => {
                                const url = URL.createObjectURL(ticket.zipBlob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `bug_report_${ticket.id}.zip`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-sm font-medium transition-colors"
                            >
                              <Upload className="w-4 h-4 rotate-180" />
                              Завантажити ZIP
                            </button>
                            {ticket.status === 'pending' && (
                              <button 
                                onClick={async () => {
                                  await ticketStore.updateTicketStatus(ticket.id, 'resolved');
                                  loadTickets();
                                }}
                                className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded text-sm font-medium transition-colors"
                              >
                                Позначити як вирішено
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'player' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4">
                    <h1 className="text-2xl font-bold text-slate-800">Аналіз баг-репортів</h1>
                    <label className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md cursor-pointer transition-colors text-sm font-bold shadow-sm">
                      <Upload className="w-4 h-4" />
                      Завантажити ZIP-архів
                      <input type="file" accept=".zip" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>

                  {!uploadedReport ? (
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 flex flex-col items-center justify-center text-slate-500 bg-slate-50">
                      <PlaySquare className="w-12 h-12 text-slate-300 mb-4" />
                      <p className="font-medium text-lg">Немає завантаженого звіту</p>
                      <p className="text-sm mt-1">Завантажте файл .zip, сформований через Bug Reporter, щоб проаналізувати помилку.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                          <FileJson className="w-4 h-4 text-slate-500" /> Опис користувача:
                        </h3>
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans bg-white p-3 rounded border border-slate-200">
                          {uploadedReport.description}
                        </pre>
                      </div>

                      {uploadedReport.projectState && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-blue-900 mb-1">Збережений стан проєкту</h3>
                            <p className="text-sm text-blue-700">Архів містить зліпок проєкту на момент помилки.</p>
                          </div>
                          <button 
                            onClick={() => {
                              if(window.confirm('Це замінить ваш поточний проєкт. Продовжити?')) {
                                loadProject(uploadedReport.projectState);
                                setIsServiceOpen(false);
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors"
                          >
                            Завантажити цей проєкт
                          </button>
                        </div>
                      )}

                      {uploadedReport.recording && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex flex-col items-center">
                          <div className="p-3 bg-white border-b border-slate-200 w-full font-bold text-slate-700 text-sm flex items-center gap-2">
                            <PlaySquare className="w-4 h-4 text-slate-500" /> Запис дій (rrweb)
                          </div>
                          <div className="p-4 w-full flex justify-center">
                            <div 
                              ref={playerRef} 
                              className="shadow-lg bg-slate-200 rounded overflow-hidden flex items-center justify-center text-slate-500 font-medium"
                              style={{ width: 800, height: 450 }}
                            >
                               Завантаження відео... (Або запис відсутній)
                            </div>
                          </div>
                        </div>
                      )}

                      {uploadedReport.screenshot && !uploadedReport.recording && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-100">
                          <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-2 font-bold text-slate-700 text-sm">
                            <ImageIcon className="w-4 h-4 text-slate-500" /> Скріншот екрану
                          </div>
                          <img src={uploadedReport.screenshot} alt="Bug screenshot" className="w-full h-auto" />
                        </div>
                      )}

                      {uploadedReport.logs && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="p-3 bg-white border-b border-slate-200 font-bold text-slate-700 text-sm">
                            Лог консолі (Console Errors)
                          </div>
                          <div className="bg-slate-900 p-4 max-h-64 overflow-y-auto">
                            <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                              {uploadedReport.logs}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
