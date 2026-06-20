import React, { useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { X, Book, LayoutDashboard, Scissors, Box, Layers, Settings, Play, Trash2, FolderOpen, Save, FileText, Image, Search, Ruler, Monitor, MousePointerSquareDashed, Eraser } from 'lucide-react';

type HelpSection = 'main' | 'quick' | '2d' | '3d_editor' | '3d_preview' | 'slab' | 'parts' | 'texture';

export function HelpDialog() {
  const isHelpOpen = useUIStore(s => s.isHelpOpen);
  const setIsHelpOpen = useUIStore(s => s.setIsHelpOpen);
  const [activeSection, setActiveSection] = useState<HelpSection>('main');

  if (!isHelpOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 text-slate-800">
            <div className="w-8 h-8 bg-[#0084ff] rounded-md flex items-center justify-center">
              <Book className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold font-sans">Бібліотека інструкцій</h2>
          </div>
          <button 
            onClick={() => setIsHelpOpen(false)}
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
              <LayoutDashboard className="w-4 h-4" /> Системні інструменти (Справа)
            </button>
            <button 
              onClick={() => setActiveSection('quick')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'quick' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <FileText className="w-4 h-4" /> Управління проєктом (Центр)
            </button>
            <button 
              onClick={() => setActiveSection('2d')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === '2d' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Scissors className="w-4 h-4" /> 2D Розкрій
            </button>
            <button 
              onClick={() => setActiveSection('3d_editor')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === '3d_editor' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Box className="w-4 h-4" /> 3D Редактор
            </button>
            <button 
              onClick={() => setActiveSection('3d_preview')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === '3d_preview' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Layers className="w-4 h-4" /> 3D Прев'ю
            </button>
            <button 
              onClick={() => setActiveSection('texture')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'texture' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Image className="w-4 h-4" /> Підбір текстури
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-white prose prose-slate max-w-none">
            {activeSection === 'main' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">Системні інструменти (Справа)</h1>
                <p className="text-slate-600 mb-6">Ці інструменти знаходяться в правій частині верхньої панелі та відповідають за налаштування інтерфейсу і загальні функції додатку.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><Settings className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Налаштування</h3>
                      <p className="text-sm text-slate-600 m-0">Відкриває глобальні налаштування додатку: параметри пилки, відступи за замовчуванням та інше.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><Trash2 className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Очистити розрахунок</h3>
                      <p className="text-sm text-slate-600 m-0">Видаляє всі результати поточного розкрою (розташовані деталі на слябах). Самі деталі залишаються у списку нерозміщених.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeSection === '2d' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">2D Розкрій</h1>
                <p className="text-slate-600 mb-6">Цей розділ містить панель інструментів над кресленням слябів для налаштування відображення та роботи з деталями.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Monitor className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Технічний</h3>
                      <p className="text-sm text-slate-600 m-0">Базовий режим відображення розкрою у вигляді креслення (контури деталей на сірому тлі).</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Image className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Поверх фото</h3>
                      <p className="text-sm text-slate-600 m-0">Відображає креслення деталей поверх завантаженої фотографії сляба з напівпрозорою заливкою для зручності орієнтування.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Layers className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Текстурний режим</h3>
                      <p className="text-sm text-slate-600 m-0">Максимально реалістичний режим, де деталі вирізаються безпосередньо з фотографії сляба, імітуючи кінцевий результат виробу.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Ruler className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Розміри</h3>
                      <p className="text-sm text-slate-600 m-0">Вмикає або вимикає відображення габаритів на кожній деталі, а також автоматичних і додаткових ручних розмірів на слябі.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><MousePointerSquareDashed className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Підбір текстури</h3>
                      <p className="text-sm text-slate-600 m-0">Дозволяє зафіксувати деталі та працювати з фоном сляба. Коли ця кнопка синя (активна), ви можете підбирати ідеальний малюнок каменю для кожної деталі безпосередньо на фотографії.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Eraser className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Очистити додаткові розміри</h3>
                      <p className="text-sm text-slate-600 m-0">Видаляє всі створені вручну розміри на поточному слябі за один клік.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Trash2 className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Видалити розмір</h3>
                      <p className="text-sm text-slate-600 m-0">Видаляє обраний (виділений кліком) ручний розмір. Аналог клавіші Delete.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Search className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Лупа</h3>
                      <p className="text-sm text-slate-600 m-0">Відкриває додаткове вікно збільшення для точної роботи з дрібними деталями та прив'язками на великих слябах.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'quick' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">Управління проєктом (Центр шапки)</h1>
                <p className="text-slate-600 mb-6">Ці кнопки розташовані по центру верхньої панелі та призначені для операцій збереження, імпорту, експорту та створення нових проєктів.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-800 rounded flex items-center justify-center text-white shadow-sm"><span className="text-2xl font-bold">+</span></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Створити новий проєкт</h3>
                      <p className="text-sm text-slate-600 m-0">Ініціює створення абсолютно нового проєкту з чистого аркуша.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-800 rounded flex items-center justify-center text-white shadow-sm"><Save className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Збереження</h3>
                      <p className="text-sm text-slate-600 m-0">Випадаюче меню для збереження проєкту локально на комп'ютер у форматі JSON або в хмарний Особистий кабінет (де автозбереження працює автоматично).</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-800 rounded flex items-center justify-center text-white shadow-sm"><FolderOpen className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Мої проєкти / Завантажити</h3>
                      <p className="text-sm text-slate-600 m-0">Випадаюче меню, що дозволяє відкрити вікно Особистого кабінету з вашими проєктами або імпортувати проєкт із файлу JSON з комп'ютера.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-800 rounded flex items-center justify-center text-white shadow-sm"><FileText className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Експорт та Звіти</h3>
                      <p className="text-sm text-slate-600 m-0">Випадаюче меню для генерації звітів: Експорт PNG, Експорт детального PDF, Експорт у креслення DXF (в розробці) та генерації Комерційної пропозиції.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === '3d_editor' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">3D Редактор</h1>
                <p className="text-slate-600 mb-6">У 3D редакторі ви можете зібрати фінальний виріб (наприклад, стільницю з підклейками) з вирізаних деталей.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><Box className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Робота з деталями</h3>
                      <p className="text-sm text-slate-600 m-0">Перетягуйте деталі з лівої панелі на 3D сцену. Клікайте на деталь, щоб обрати її та переміщувати або обертати.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><MousePointerSquareDashed className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Переміщення та обертання</h3>
                      <p className="text-sm text-slate-600 m-0">Використовуйте кнопки на верхній панелі для перемикання між режимами переміщення (стрілки) та обертання (кола). При переміщенні деталі автоматично "прилипають" до країв інших деталей для точного стикування.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === '3d_preview' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">3D Прев'ю</h1>
                <p className="text-slate-600 mb-6">Цей режим відкриває "плаваюче" вікно з 3D моделлю, яке залишається поверх інших інструментів.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><Layers className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Синхронний перегляд</h3>
                      <p className="text-sm text-slate-600 m-0">Ідеально підходить для режиму "Підбір текстури" — ви бачите, як текстура каменю лягає на деталі прямо на зібраній 3D моделі, і зміни відображаються миттєво.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'texture' && (
              <div className="animate-in slide-in-from-right-4 duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">Підбір текстури</h1>
                <p className="text-slate-600 mb-6">Окремий режим перегляду і обробки для точного підбору текстури на слябах, створення текстурних рамок та спільного узгодження вигляду виробу.</p>
                
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-[#0084ff] rounded flex items-center justify-center text-white shadow-sm"><Image className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Переміщення деталей</h3>
                      <p className="text-sm text-slate-600 m-0">Перетягуйте деталі безпосередньо по фотографії сляба, щоб підібрати найкращий малюнок каменю.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Scissors className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Створення рамки</h3>
                      <p className="text-sm text-slate-600 m-0">Ви можете створити "текстурну рамку", щоб об'єднати декілька деталей у групу та переміщувати їх разом, зберігаючи їхнє взаємне розташування.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                    <div className="w-10 h-10 shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-500 shadow-sm"><Search className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 m-0 mb-1">Навігація</h3>
                      <p className="text-sm text-slate-600 m-0">Використовуйте колесо миші для вертикальної прокрутки зони, та затисніть Shift + колесо миші для масштабування (зуму) зони підбору текстури.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeSection !== 'main' && activeSection !== '2d' && activeSection !== 'texture' && activeSection !== 'quick' && activeSection !== '3d_editor' && activeSection !== '3d_preview' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300 flex flex-col items-center justify-center h-full text-center text-slate-400">
                <Book className="w-16 h-16 mb-4 opacity-20" />
                <h2 className="text-xl font-bold text-slate-500">Розділ у розробці</h2>
                <p>Інструкції для цього розділу будуть додані найближчим часом.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
