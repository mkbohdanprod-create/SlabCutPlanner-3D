import  { useEffect, useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { X, Book, LayoutDashboard, Scissors, Box, Layers, Settings,  Trash2, FolderOpen, Save, FileText, Image, Search, Ruler, Monitor, MousePointerSquareDashed, Eraser, Copy, Lock, Crosshair, Waves, RotateCw, Upload, Split } from 'lucide-react';

type HelpSection = 'main' | 'quick' | '2d' | 'product_editor' | 'tree' | 'sizes' | 'sides' | 'edges' | 'corners' | 'cutouts' | 'millings' | 'joints' | 'sink' | 'measure' | '3d_editor' | '3d_preview' | 'slab' | 'parts' | 'texture';

/** Скріншот у довідці: файл із public/help (копіюється в збірку як є). */
function HelpShot({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-3">
      <img src={src} alt={caption} className="w-full rounded-md border border-slate-200 shadow-sm" loading="lazy" />
      <figcaption className="text-xs text-slate-500 italic mt-1.5">{caption}</figcaption>
    </figure>
  );
}


/**
 * Картка довідки. До 10.08 кожен блок був скопійованою розміткою на шість
 * рядків — і розділи почали розповзатися стилями. Тепер один компонент.
 */
function HelpBlock({ icon, title, children, accent = false }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  /** Синя іконка — для головного блока розділу. */
  accent?: boolean;
}) {
  return (
    <div className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
      <div className={`w-10 h-10 shrink-0 rounded flex items-center justify-center shadow-sm ${accent ? 'bg-[#0084ff] text-white' : 'bg-slate-200 text-slate-500'}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-800 m-0 mb-1">{title}</h3>
        <p className="text-sm text-slate-600 m-0 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

export function HelpDialog() {
  const isHelpOpen = useUIStore(s => s.isHelpOpen);
  const setIsHelpOpen = useUIStore(s => s.setIsHelpOpen);
  const helpSection = useUIStore(s => s.helpSection);
  const [activeSection, setActiveSection] = useState<HelpSection>('main');

  // Кнопка «i» біля інструмента відкриває довідку одразу на своєму розділі.
  // Синхронізуємо при кожному відкритті, а не один раз на монтуванні:
  // діалог живе весь час і між відкриттями не перемонтовується.
  useEffect(() => {
    if (isHelpOpen && helpSection) setActiveSection(helpSection as HelpSection);
  }, [isHelpOpen, helpSection]);

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
              onClick={() => setActiveSection('slab')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'slab' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Layers className="w-4 h-4" /> Слеби і дефекти
            </button>
            <button
              onClick={() => setActiveSection('product_editor')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'product_editor' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Ruler className="w-4 h-4" /> Редактор виробу
            </button>
            <button
              onClick={() => setActiveSection('tree')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'tree' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <FolderOpen className="w-4 h-4" /> Дерево виробу
            </button>
            <button
              onClick={() => setActiveSection('sizes')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'sizes' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Lock className="w-4 h-4" /> Розміри і замки
            </button>
            <button
              onClick={() => setActiveSection('sides')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'sides' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Layers className="w-4 h-4" /> Сторони і доповнення
            </button>
            <button
              onClick={() => setActiveSection('edges')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'edges' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Scissors className="w-4 h-4" /> Кромки і торці
            </button>
            <button
              onClick={() => setActiveSection('corners')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'corners' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <RotateCw className="w-4 h-4" /> Кути і радіуси
            </button>
            <button
              onClick={() => setActiveSection('cutouts')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'cutouts' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <MousePointerSquareDashed className="w-4 h-4" /> Вирізи
            </button>
            <button
              onClick={() => setActiveSection('millings')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'millings' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Waves className="w-4 h-4" /> Фрезерування площини
            </button>
            <button
              onClick={() => setActiveSection('joints')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'joints' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Split className="w-4 h-4" /> Стики між деталями
            </button>
            <button
              onClick={() => setActiveSection('sink')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'sink' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Box className="w-4 h-4" /> Мийка у виробі
            </button>
            <button
              onClick={() => setActiveSection('measure')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'measure' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Crosshair className="w-4 h-4" /> Замір з приладу
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
                  {/* Картка «Лупа» видалена 03.09.2026 разом із самою лупою. */}
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

            {activeSection === 'product_editor' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-6 text-slate-800 border-b pb-4">Редактор виробу</h1>
                <p className="text-slate-600 mb-6">
                  Виріб — це не одна плита, а набір деталей: стільниця, доповнення по її сторонах
                  (бортики, потовщення, підвороти), окремі елементи (ноги, стінові панелі, мийка)
                  і стики між ними. Ліворуч — дерево виробу, у центрі — 2D креслення і 3D модель,
                  праворуч — властивості тієї деталі, яку ви зараз обрали в дереві.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Box className="w-5 h-5" />} accent title="З чого починається виріб">
                    Кнопка «+ Створити виріб» задає базову деталь: назву, тип (стільниця, стінова
                    панель, мийка), товщину, кількість і форму — прямокутна, Г-подібна чи П-подібна.
                    Далі все, що ви робите, стосується деталі, ВИБРАНОЇ В ДЕРЕВІ ліворуч: клацнули
                    на ногу — правий трей показує сторони й кромки саме ноги.
                  </HelpBlock>

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="Розміри">
                    Сторони позначені літерами A, B, C… Розмір вводиться в поле і застосовується
                    після Enter або коли ви клацнете поза полем — поки ви набираєте, нічого не
                    перераховується. Escape скасовує правку.
                    <br /><br />
                    Глибина стільниці (сторони E і B у Г-подібної) не пливе від інших змін: якщо
                    ви змінюєте габарит, програма посуне виріз чи плече, а глибину лишить.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Сторони: бортики, потовщення, підвороти">
                    Розділ «Сторони» — це список доповнень на кожній стороні. «+» біля сторони
                    додає бортик, потовщення або підворот; у вікні задаються висота, ширина
                    (за замовчуванням — уся сторона) і відступ від краю.
                    <br /><br />
                    На одній стороні їх може бути кілька: наприклад, потовщення на 700 мм від
                    лівого краю і ще одне далі. Клік по чипу — редагувати, хрестик — прибрати.
                    Те саме доступне правою кнопкою миші по ребру деталі в 3D.
                  </HelpBlock>

                  <HelpBlock icon={<Scissors className="w-5 h-5" />} title="Кромки (обробка торців)">
                    Окремий розділ, бо кромка і підворот на одній стороні — нормально, вони не
                    виключають одне одного. Для кожної сторони обирається профіль лицьового і
                    тильного ребра; кнопка-ланка тримає їх однаковими.
                    <br /><br />
                    «Довільна» замість «На всю довжину» дає обробку шматком: прив'язка (ліва,
                    центр, права), відступ і розмір. «Факт. розмір» показує довжину з поправкою
                    на вихід інструмента. Саме ця довжина йде в кошторис і в креслення.
                  </HelpBlock>

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="Кути і вирізи">
                    «Обробка кутів» — радіус або зріз на кутах AB, BC і далі. «Обробка площин» —
                    вирізи всередині деталі: під розетку, під змішувач, довільні. Виріз
                    прив'язується до кута деталі й задається відстанню від нього, тому при зміні
                    габариту він лишається там, де ви його поставили.
                  </HelpBlock>

                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} title="Стики (з'єднання деталей)">
                    Стик — це шов між двома шматками каменю. Він потрібен, коли виріб довший за
                    слеб або коли Г-подібна стільниця ріжеться на плечі. Стик додається в розділі
                    «Стики» або кліком по деталі в режимі «Стики» 3D-панелі; на кресленні він
                    показується пунктиром.
                    <br /><br />
                    Зсув стику задається ВІДСТАННЮ від опорного кута — напрямок програма
                    визначає сама, всередину деталі. Тип стику (пряма склейка, заусовка 45°)
                    визначає, які послуги нарахуються цеху.
                  </HelpBlock>

                  <HelpBlock icon={<Image className="w-5 h-5" />} title="Мийка і окремі елементи">
                    «Встановлення мийки в виріб» вставляє мийку і одночасно робить під неї виріз
                    у стільниці — окремо різати не треба. Нога і стінова панель додаються правою
                    кнопкою по ребру: вони стають самостійними елементами виробу зі своїм
                    деревом, бо теж можуть мати кромки, вирізи й доповнення.
                  </HelpBlock>

                  <HelpBlock icon={<Monitor className="w-5 h-5" />} title="Панель над кресленням">
                    «Перегляд» — просто дивитись. «Редагування» вмикає роботу з елементами
                    деталі, і поруч зʼявляються режими: Кути, Площини, Сторони, Стики — вони
                    визначають, ЩО саме ви чіпаєте кліком у 3D. «Розміри» показує розмірні лінії.
                  </HelpBlock>

                  <HelpBlock icon={<Save className="w-5 h-5" />} title="Збереження">
                    «Зберегти виріб» повертає вас у проєкт і одразу перераховує розкрій.
                    «Скасувати» виходить без змін. Поки ви в редакторі, Ctrl+Z відкочує кроки
                    саме в ньому, а не в проєкті.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'sizes' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Розміри і замки</h1>
                <p className="text-slate-600 mb-6">
                  Вікно «Налаштування розмірів та торців» відкривається <b>подвійним кліком по деталі
                  в 3D</b>. Ліворуч креслення з підписами, праворуч вузька панель: рядок на кожну
                  сторону — літера, розмір, замок. Кромки задаються не тут, а в панелі «Кромки
                  (Обробка торців)» у властивостях деталі.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Ruler className="w-5 h-5" />} accent title="Літери — це сторони, λ — константа">
                    Сторони підписані <b>A–H</b> за обходом контуру: сторона закінчується в куті з тією
                    самою назвою. Те, що стороною не є, позначаємо <b>грецькою літерою</b>: у П-подібної
                    це <b>λ</b> — глибина верхньої перекладини (колишня «Ширина»). Літери на кресленні
                    й у панелі — одні й ті самі.
                  </HelpBlock>
                  <HelpShot src="/help/sizes/panel.png" caption="Вікно розмірів: креслення ліворуч, панель праворуч. Сторона G закрита замком — зелена і на кресленні, і в списку; її поле сіре." />

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Чому розмір «сам» міняє сусіда">
                    У Г- і П-подібної сторони зв'язані рівняннями — габарит дорівнює сумі часток:
                    <br />
                    <span className="font-mono text-[13px] text-slate-700">Г: A = C + E · F = B + D</span>
                    <br />
                    <span className="font-mono text-[13px] text-slate-700">П: A = G + E + C · H = F + λ · B = D + λ</span>
                    <br />
                    Тому змінити один розмір «просто так» неможливо: хтось мусить поступитись. Раніше
                    вибір робила програма, завжди однаково. Тепер вибираєте ви — замками.
                  </HelpBlock>

                  <HelpBlock icon={<Lock className="w-5 h-5" />} title="Замок = це число не змінюється">
                    Закритий замок означає рівно одне: розмір не поїде — ні сам, коли рухають сусідів,
                    ні руками (поле стає сірим). Замикати можна <b>двома способами</b>: кнопкою-замком
                    у рядку або <b>кліком по квадратику з літерою прямо на кресленні</b>. Білий
                    квадратик — вільна сторона, зелений — закрита. Клік ще раз — знімає.
                  </HelpBlock>
                  <HelpShot src="/help/sizes/letters.png" caption="Квадратики на кресленні: G і C закриті (зелені), решта вільні (білі). Клік по квадратику замикає і відмикає, клік по числу — редагує розмір." />

                  <HelpBlock icon={<Eraser className="w-5 h-5" />} title="Розмір міняється прямо на кресленні">
                    Біля кожної сторони стоїть <b>просто число</b> — літера не дублюється, бо вона вже
                    у квадратику поруч. Клацніть по числу — воно стає полем вводу на своєму ж місці:
                    наберіть новий розмір, <b>Enter</b> застосує, <b>Esc</b> скасує, клік поза полем теж
                    застосує. Числа <b>закритих замком</b> сторін бліді й не клікаються — стан замка
                    видно по самому кресленню, без списку.
                  </HelpBlock>

                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} title="Хто поступиться — приклад">
                    Закрийте <b>G</b> і <b>C</b>, поставте <b>A = 3000</b> — виросте <b>E</b> (виріз).
                    Закрийте <b>E</b> і <b>G</b>, поставте A = 3000 — виросте <b>C</b> (права нога).
                    Наведіть на поле — підказка каже наперед, чий розмір поїде. Якщо в рівнянні закриті
                    ВСІ сусіди, поле сіріє: поступитись нема кому, зніміть якийсь замок.
                  </HelpBlock>
                  <HelpShot src="/help/sizes/rows.png" caption="Замки на G і C: A 2400 → 3000 забрав виріз E (1200 → 1800). Ноги стоять там, де їх поставили." />

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="λ — одна на обидві ноги">
                    λ стоїть одразу в двох рівняннях висот, бо перекладина в деталі одна. Якщо ви
                    міняєте висоту H, а ногу F закрили замком — поїде λ, і слідом підлаштується виріз
                    D з іншого боку. Замкніть λ — і перекладина не попливе, хай що робите з висотами.
                    Якщо рухатись нікуди (закриті і F, і вся права вертикаль), правка не застосується.
                  </HelpBlock>
                  <HelpShot src="/help/sizes/lambda.png" caption="Блок λ із власним замком: та сама математика, що й у сторін." />

                  <HelpBlock icon={<Book className="w-5 h-5" />} title="Що варто знати ще">
                    Замки живуть у вікні, а не в деталі: закрили вікно — замків немає, у файлі проєкту
                    нічого зайвого не зберігається. Розмір застосовується на <b>Enter</b> або коли
                    клікнете поза полем; <b>Esc</b> скасовує набране. Деталь із довільним контуром
                    (з DXF або бланка) розмірів з поля не приймає — там форму задають точки контуру.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'measure' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Замір з приладу — вкладка «Замір» у Конструкторі</h1>
                <p className="text-slate-600 mb-6">
                  Замірник знімає приміщення далекоміром Leica (застосунок iCONtrades) і віддає
                  архів або DXF. Ця вкладка читає його <b>як є</b> і робить те, що конструктор
                  досі робив руками в AutoCAD: прибирає службове, зводить кути, будує панель зі
                  стіни. Правила, за якими вона це робить, узяті з розбору реальних замірів —
                  звід <code className="text-[13px] bg-slate-100 px-1 rounded">ПРАВИЛА_ОБРОБКИ_ЗАМІРУ_КОНСТРУКТОР</code> (коди ЗК-…, вони підписані на кожній кнопці).
                  <b> Нічого не затверджується само:</b> кожна операція показує, що саме зміниться, і
                  чекає на «Прийняти»; сирий файл не правиться.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Upload className="w-5 h-5" />} accent title="1. Що підвантажувати">
                    Кнопка приймає <b>ZIP з приладу</b> (тека <code>iCONtrades_…_Exports</code>) або
                    окремий <b>.dxf</b>. У ZIP на кожен виріб є пара файлів — <code>_3D</code> і
                    <code> _2D</code>; інструмент бере <b>3D</b>, бо в ньому є висоти, площини стін і
                    сирі точки приладу, а 2D — це його точна плоска проєкція (звірено, розбіжність
                    0,000 мм) і йде лише на звірку. Якщо проєктів у ZIP кілька (кухня, острів,
                    підвіконня) — вибираєте кнопкою, який відкрити.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="2. Ліва колонка: що прочиталось">
                    Формат файла, скільки відрізків, скільки <b>сирих точок</b> приладу, скільки
                    площин стін, габарит. Нижче — <b>шари по сім'ях</b>: «план», «площини стін»,
                    «сирі точки», «лазер». Галочка ховає шар з полотна. Під ними — «Відкинуто
                    (службове)»: рамки кадру, маркери приладу, вертикальні лінії-опускання. Це не
                    втрата даних, а прибирання того, що не є геометрією приміщення.
                  </HelpBlock>

                  <HelpBlock icon={<Crosshair className="w-5 h-5" />} title="3. Дублети в кутах — головна операція">
                    Прилад у куті майже завжди дає <b>дві-три точки поруч</b> (5–40 мм): промінь
                    б'є не рівно в ріг. Справжній кут — це <b>перетин двох стін</b>, продовжених
                    крізь ці точки. Інструмент знаходить такі пари, малює на плані кружечок із
                    підписом «дублет 14.2» (це відстань між точками) і показує списком: «вершини
                    7–8: 14,2 мм → Δ 9,0 / 10,9» — наскільки перетин відійде від кожної з них.
                    Галочками вмикаєте по одному, кнопкою — усі. <b>Поріг, мм</b> — до якої відстані
                    вважати пару дублетом (20 за замовчуванням). Проміжні точки на прямій стіні не
                    чіпаються, кути НЕ приводяться до 90°, контур стін лишається відкритим — стіна
                    не деталь.
                  </HelpBlock>

                  <HelpBlock icon={<Scissors className="w-5 h-5" />} title="4. Зшити розсипане — і побачити, де рветься">
                    Прилад віддає стіни, ніші й корпуси окремими шматками із зазорами. «Зшити з
                    порогом» склеює ті шматки, чиї кінці ближчі за поріг, і ставить «замкнений»,
                    якщо контур зійшовся. Головне — <b>не вгадувати число</b>: усі розриви показані
                    списком у панелі («12,3 · 17,5 · 25,2 · 28,0 …») і пунктиром прямо на плані —
                    <b> зелений</b> означає, що поточний поріг його вже перекриває, <b>червоний</b> — ні.
                    Клік по числу ставить поріг рівно під нього. Рядок «поріг 26 мм дасть 7 ланцюгів»
                    показує результат ще до натискання. Зазори зазвичай лягають двома купками
                    (кілька міліметрів — і два-три десятки), тому й порогів практично два.
                    Зшивання завжди рахується від сирого файла, тому поріг можна крутити туди-сюди
                    без наслідків.
                  </HelpBlock>

                  <HelpBlock icon={<RotateCw className="w-5 h-5" />} title="5. Довернути по ребру">
                    Приміщення знято під випадковим кутом. Тут видно найдовші ребра з їхнім кутом і
                    потрібним доворотом; вибираєте, по якому рівняти (за замовчуванням — найдовше),
                    і повертається <b>весь замір</b> разом. Це те, що конструктор робить першим
                    кроком, щоб деталі не стояли навскіс.
                  </HelpBlock>

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="6. Розгортка стіни → панель">
                    Друга вкладка полотна. Сіре — контур стіни, як його дав прилад; синє — <b>панель</b>:
                    відкинуто кінці обходу, кути зведено, контур замкнено. Помаранчеві прямокутники —
                    <b> розетки з файла</b> з їхніми розмірами і висотою від низу панелі. «Нуль по
                    висоті» за замовчуванням — <b>верх корпусів</b> (так ставить прилад), низ панелі
                    +43 мм (камінь 20 + фанера 20 + шов); обидва — поля, міняються під кейс.
                  </HelpBlock>

                  <HelpBlock icon={<Waves className="w-5 h-5" />} title="7. Хвиля стіни, лазер, переріз">
                    <b>Хвиля</b> — сирі точки біля стіни, розфарбовані за відхиленням від площини:
                    зелене в межах порога, жовте до подвійного, червоне далі. Це те, що на монтажі
                    стане зазором. <b>Горизонт по лазеру</b> — слід хрестового рівня і нахил у
                    площині кожної стіни. <b>Переріз на висоті</b> — план на потрібному z (стільниця
                    ≈900, панель ≈1500): план у файлі зібраний із точок, знятих на різних висотах,
                    тому для точного контуру беруть саме переріз.
                  </HelpBlock>

                  <HelpBlock icon={<Copy className="w-5 h-5" />} title="8. Провенанс — звідки взялась кожна вершина">
                    Третя вкладка правої колонки: таблиця «вершина → сира точка приладу» або
                    «перетин ← 7+8». Позначка «= сира» означає збіг із точкою приладу до 0,05 мм.
                    Це відповідь на питання цеху «звідки цей розмір» і страховка від тихої втрати
                    даних.
                  </HelpBlock>

                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} title="Чого інструмент НЕ робить">
                    Не пише у файл приладу. Не затверджує контур сам — «Прийняти як приміщення»
                    ставить стіни у вкладку «Приміщення», решта операцій лягає в оброблений шар і в
                    журнал рішень із кодом правила. Експорту назад у DXF поки немає — питання
                    відкрите. Полотно: колесо — масштаб, тягнення — панорама.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'sides' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Сторони (Бортики, Потовщення, Підвороти)</h1>
                <p className="text-slate-600 mb-6">
                  Доповнення — це те, що виростає з ребра деталі: бортик, потовщення, підворот,
                  стінова панель, опора. Панель «Сторони» в редакторі виробу — їхній список по
                  кожній стороні: рядок — сторона, на ній чипи вже доданих доповнень і «+».
                  Кромки живуть окремо (панель «Кромки»), бо кромка і підворот на одній стороні —
                  нормальна виробнича ситуація.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Layers className="w-5 h-5" />} accent title="Рядок сторони">
                    Літера — та сама сторона, що на кресленні, у вікні розмірів і в 3D. Далі чипи:
                    <b> клік по чипу — редагувати</b> в модалці, хрестик — прибрати. Порожня
                    сторона показує «—». На одній стороні доповнень може бути кілька: потовщення
                    клеїться шматками, а «панель | вікно | панель» — це два чипи панелі з
                    відступами по одній стороні.
                  </HelpBlock>
                  <HelpShot src="/help/sides/panel.png" caption="Ліворуч — рядки з чипами: потовщення на A, бортик і підворот на B, опора на D; колір чипа = тип. Праворуч — меню «+» на стороні C: бортик, потовщення, підворот, панель, опора." />

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="«+»: п'ять типів">
                    <b>Бортик</b> — оздоблення стільниці, росте вгору від краю (на нозі чи панелі
                    його в меню немає). <b>Потовщення</b> — смуга під ребром, робить плиту візуально
                    товщою. <b>Підворот</b> — опуск площини вниз. <b>Панель</b> — стінова панель на
                    ребрі. <b>Опора</b> — нога. Типові висоти підставляються самі: потовщення 40,
                    бортик 50, підворот 100, панель 600, опора 900 мм.
                  </HelpBlock>

                  <HelpBlock icon={<Monitor className="w-5 h-5" />} title="Другий вхід — прямо на виробі в 3D">
                    Панель — не єдине місце. У режимі <b>«Редагування → Сторони»</b> клацніть
                    сторону прямо на моделі (бейджі-літери підказують, де яка) — відкриється те
                    саме меню: потовщення, підворот, бортик, стінова панель, нога, плюс
                    <b> «Ніша (П-виріз)»</b>, яка живе тільки тут, бо ріжеться саме з ребра.
                    Обидва входи ведуть в одну модалку: що не додай на моделі, чип з'явиться в
                    треї, і навпаки.
                  </HelpBlock>
                  <HelpShot src="/help/sides/context3d.png" caption="Режим «Редагування → Сторони»: клік по стороні C прямо на П-подібній стільниці — меню доповнень на місці. Бейджі A–H — ті самі літери, що в панелі." />

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="Висота, ширина, відступ">
                    У модалці три головні поля: <b>Висота</b> (виліт від ребра), <b>Ширина</b> вздовж
                    сторони (за замовчуванням — уся сторона) і <b>Відступ</b> від початку сторони.
                    Саме вони стоять у підписі чипа: «Потовщення 40×700 (+300)» означає висота 40,
                    ширина 700, відступ 300. Так цех бачить, де саме клеїться шматок.
                  </HelpBlock>
                  <HelpShot src="/help/sides/modal.png" caption="Потовщення на стороні B: висота 40, ширина 700, без відступу. Праворуч — як читати підпис кожного типу чипа." />

                  <HelpBlock icon={<Scissors className="w-5 h-5" />} title="«В глиб стільниці»">
                    Четверте поле модалки. <b>0</b> — смуга стоїть на кромці і стикується з плитою
                    під 45° (вус). <b>Більше нуля</b> — смуга втоплюється: йде під плиту і примикає
                    торцем, нарівні з ногою; розміри деталей система перераховує сама. Це для
                    випадків, коли потовщення ховається під нависанням, а не оздоблює край.
                  </HelpBlock>

                  <HelpBlock icon={<Box className="w-5 h-5" />} title="Доповнення — елемент дерева виробу">
                    Додане доповнення з'являється в дереві ліворуч. Клацніть його там — правий трей
                    покаже вже ЙОГО сторони: нога має свої кромки, вирізи і власні доповнення
                    (підворот ноги — на всю сторону). Тому опора чи панель — не «галочка», а
                    повноцінна деталь зі своїм кресленням у пакеті документів.
                  </HelpBlock>

                  <HelpBlock icon={<Eraser className="w-5 h-5" />} title="Сторона, якої немає, і дуги">
                    Список сторін береться з <b>реального контуру</b>, а не зі списку форми: сторона,
                    яку повністю з'їли радіуси кутів, у треї не показується — повісити на неї
                    доповнення означало б пообіцяти те, чого цех не зробить. Дуга скругленого кута
                    — навпаки, теж сторона: потовщення чи підворот на ній дає гнутий елемент.
                    Ребра Г-зарізу підписуються як D1 тощо.
                  </HelpBlock>

                  <HelpBlock icon={<Lock className="w-5 h-5" />} title="Що це змінює для кромок">
                    Потовщення, підворот і опора закривають торець — у панелі «Кромки» така сторона
                    отримує бейдж «зайнято», і форму на неї не поставиш. Бортик і стінова панель
                    ростуть угору і торця не закривають. У старих виробах доповнення «на всю
                    сторону» показуються такими ж чипами з підказкою «створено старим способом» —
                    клік по чипу переводить їх у нові налаштування з шириною і відступом.
                  </HelpBlock>

                </div>
              </div>
            )}

            {activeSection === 'edges' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Кромки і торці</h1>
                <p className="text-slate-600 mb-6">
                  Кромка — це форма обробки ребра плити: фаска, радіус, борт. Форми взяті з каталогу
                  цеху «Все кромки» (17.09.25) разом із розрізами. Панель «Кромки (Обробка торців)»
                  у редакторі виробу показує по одному рядку на кожну сторону деталі; усе, що не
                  потрібно щодня, сховано за шевроном.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Scissors className="w-5 h-5" />} accent title="Рядок сторони">
                    Зліва направо: буква сторони (синя — кромка задана; це кнопка, див. «Взірець»),
                    маленький розріз обраної форми, випадачка лицьового ребра, шеврон розширених
                    налаштувань і довжина сторони. За замовчуванням кромка ставиться на ЛИЦЬОВЕ
                    ребро на всю довжину — цього досить у 9 випадках із 10.
                  </HelpBlock>
                  <HelpShot src="/help/edges/panel.png" caption="Згорнуто — по рядку на сторону; те, що задано в розширених (тильне ребро, довільна ділянка), видно бейджами. Розгорнуто — тильне ребро зі зв'язкою, «Вся довжина / Ділянка», ручне доопрацювання." />

                  <HelpBlock icon={<Copy className="w-5 h-5" />} title="Взірець: клік по букві копіює обробку">
                    Клацніть букву сторони — вона стає <b>взірцем</b> (буква і розріз зеленим, угорі
                    підказка «взірець A»). Тепер клік по будь-якій іншій букві ставить тій стороні
                    ІДЕНТИЧНІ налаштування: лицьове й тильне ребро, ділянку, ручне доопрацювання.
                    Клацайте далі — взірець лишається, поки не клацнете його ще раз або Esc. Букви в 3D
                    (квадратики на сторонах) — ті самі кнопки: клік по квадратику в 3D = клік по
                    букві в панелі, підсвітка збігається.
                  </HelpBlock>
                  <HelpShot src="/help/edges/letters.png" caption="Взірець C (зелений) у 3D і в панелі; B щойно отримала копію — R3, тильне chamfer, ділянка; A закрита потовщенням (бліда пунктирна), D вільна." />

                  <HelpBlock icon={<Lock className="w-5 h-5" />} title="Сторона, закрита доповненням">
                    Нога, потовщення чи підворот звисають з ребра і закривають торець — фрезерувати
                    там нема чого. Така сторона в панелі показує бейдж «зайнято: Потовщення (A)»,
                    випадачка і розширені вимкнені, буква бліда і не стає взірцем. Якщо форма стояла
                    ще до того, як сторону закрило доповнення, — червоний бейдж «форма лишилась» і
                    кнопка «прибрати»: мовчки нічого не стирається. Так само в таблиці сторін 2D.
                    Бортик і стінова панель ростуть угору й торця не закривають.
                  </HelpBlock>

                  <HelpBlock icon={<Search className="w-5 h-5" />} title="Випадачка: групи по матеріалу">
                    Форми впорядковані за матеріалом виробу: спершу <b>Універсальні</b> (фаска 2×2,
                    R2, техфаска), далі форми ВАШОГО матеріалу <b>у товщині плити</b>, потім ті, що
                    можливі <b>лише з потовщенням</b> (борт 40 у кварциту, підклейка 33 в акрилу —
                    зрощення плит), <b>Операції торця</b> (стик Z, антик, торець 45° — це не форми),
                    <b> Інші матеріали</b> і <b>Спадок</b> (форми, яких у каталозі цеху нема). Нічого не
                    сховано — просто ваше вгорі. Наведіть на пункт — підказка каже, як форма
                    виконується в цеху.
                  </HelpBlock>

                  <HelpBlock icon={<Image className="w-5 h-5" />} title="Розріз: навести — побачити велике">
                    Маленький розріз біля букви сторони — справжнє креслення з каталогу. Наведіть і
                    потримайте — спливе велике зображення з кодом, назвою, формою словами, матеріалами
                    й припуском. Так само працює в довіднику і в таблиці розмірів 2D.
                  </HelpBlock>
                  <HelpShot src="/help/edges/hover.png" caption="Наведення на мініатюру H40: велике креслення, «Кварцит, Натуральний камінь · лише з потовщенням · припуск 2.5»." />

                  <HelpBlock icon={<LayoutDashboard className="w-5 h-5" />} title="Каталог з розрізами">
                    Перший пункт випадачки — «⊞ Каталог з розрізами…». Відкриває каталог картками:
                    розріз, код, форма словами, контексти з каталогу цеху (П — плінтус, С — стільниця
                    в базовій товщині, О — опуск/борт, М — мийка, В — виріз під мийку), спосіб
                    виконання. Пошук — по коду («ZR20»), формі («увігнутий»), id. Клік по картці
                    обирає форму і закриває каталог; «Без кромки» знімає. Помаранчева позначка
                    «ZR20?» — код каталогу цеху, прив'язку якого цех ще не підтвердив.
                  </HelpBlock>
                  <HelpShot src="/help/edges/catalog.png" caption="Каталог для виробу з кварциту: універсальні, кварцит у товщині плити, нижче — борт 40 лише з потовщенням; поточна ZS20 підсвічена." />

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="Розширені: тильне ребро, ділянка, ручне">
                    Шеврон праворуч від випадачки. <b>Тильне ребро</b> за замовчуванням НЕ зв'язане
                    (кромка — на одне лицьове ребро); кнопка-ланцюжок зв'язує його з лицьовим — та
                    сама форма, два проходи фрези в кошторисі. <b>Вся довжина / Ділянка</b>: ділянка задається
                    прив'язкою (ліва, центр, права), відступом і розміром; «Факт.» показує довжину
                    обробки з урахуванням вибігу інструмента. <b>Ручне доопрацювання</b> — позначка для
                    цеху, коли форму доводять руками.
                  </HelpBlock>

                  <HelpBlock icon={<Book className="w-5 h-5" />} title="Довідник обробок торців">
                    Кнопка «Довідник» над рядками. Тут припуски на розкрій і послуги (коди 1С) для
                    кожної форми, розріз, матеріал і виконання. Фільтри: пошук, матеріал («Кварцит +
                    універсальні»), виконання, вид (форми / операції / спадок), «лише з розрізом».
                    Матеріал і виконання беруться з каталогу цеху і тут не редагуються.
                  </HelpBlock>
                  <HelpShot src="/help/edges/reference.png" caption="Довідник: фільтри, розріз у першій колонці, матеріал і виконання пігулками, припуск і послуги." />

                  <HelpBlock icon={<Box className="w-5 h-5" />} title="Що показує 3D">
                    Кромка ріжеться на моделі як інструмент — уздовж сторони і наскрізь через кут
                    (без «Обробки торців» на куті дуга радіуса не профілюється, фреза вибігає по
                    дотичній). Нога і потовщення стають під ребро і стикуються з плитою під 45°;
                    підворот — під 45° лише на керамограніті, на кварциті лишається прямим стиком
                    (підклейка знизу). Там, де дві смуги сходяться на опуклому куті, обидві
                    зрізаються «на ус» — 45° у плані, без перетинів; нога з потовщенням: смуга
                    закінчується 45°, нога отримує виїмку лише під смугу і нижче лишається цілою.
                    Букви сторін у 3D — квадратики, що завжди дивляться на вас, як не крутіть камеру.
                  </HelpBlock>
                  <HelpShot src="/help/edges/miter.png" caption="Кут стільниці з ногою і потовщенням: ліворуч керамограніт — стик 45°, лицьова площина суцільна; праворуч кварцит — прямий стик, лінія на торці." />
                  <HelpShot src="/help/edges/corner.png" caption="Кути між доповненнями: керамограніт — потовщення A+B на ус; нога B + потовщення A — виїмка в нозі під смугу; кварцит — підвороти прямим стиком до плити, між собою на ус." />

                  <HelpBlock icon={<Monitor className="w-5 h-5" />} title="Де ще та сама випадачка">
                    2D креслення (таблиця розмірів), дизайнер обробки, властивості розміщення на карті
                    крою і контекстне меню ребра в 3D — усюди ті самі групи, каталог і мініатюри, щоб
                    кромка виглядала однаково незалежно від того, звідки її задали.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'tree' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Дерево виробу (Навігація)</h1>
                <p className="text-slate-600 mb-6">
                  Ліва панель редактора виробу — структура всього, з чого складається виріб.
                  Це не декорація: <b>вибір у дереві визначає, ЩО саме ви зараз редагуєте</b> —
                  правий трей «Властивості деталі» завжди показує властивості того рядка, який
                  підсвічений синім. Кнопка «Згорнути» ховає панель, звільняючи місце моделі.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<FolderOpen className="w-5 h-5" />} accent title="Чотири рівні">
                    <b>Виріб</b> — верхівка з назвою; «+» біля неї додає нову деталь до виробу.
                    <b> Елемент</b> (папка) — самостійна одиниця: стільниця, опора, стінова
                    панель, мийка. <b>Деталь</b> (аркуш) — те, що має контур і піде в розкрій.
                    <b> Доповнення</b> — бортик, потовщення чи підворот на стороні деталі; у
                    підписі стоїть сторона: «Підворот (B)», друге на тій самій стороні — «(B #2)».
                  </HelpBlock>
                  <HelpShot src="/help/tree/panel.png" caption="Ліворуч — стільниця з доповненнями і двома вкладеними елементами. Праворуч — вибрана ОПОРА: редагуються її сторони, у ноги свій власний підворот (C)." />

                  <HelpBlock icon={<Box className="w-5 h-5" />} title="Клік = активна деталь">
                    Клік по рядку робить деталь активною: правий трей перемикається на її
                    сторони, кромки, кути й вирізи, а подвійний клік по ній у 3D відкриває вікно
                    розмірів. Опора і стінова панель — самі елементи (папки): всередині вони
                    мають власну деталь зі своїми кромками і доповненнями — тому нога в
                    документах цеху отримує власне креслення.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Звідки в дереві беруться рядки">
                    Усе, що ви додаєте в панелях чи в 3D — потовщення зі «Сторін», нога з меню
                    ребра, мийка з «Встановлення мийки» — одразу з'являється в дереві. Дерево і
                    панелі — два види на одні й ті самі дані, тому видалити доповнення можна
                    звідки завгодно: кошиком у дереві або хрестиком на чипі в треї «Сторони».
                  </HelpBlock>

                  <HelpBlock icon={<Trash2 className="w-5 h-5" />} title="Видалення — чисте">
                    Кошик у рядку прибирає деталь разом з її записами: потовщення чи підворот,
                    заведені ще старим способом («на всю сторону»), видаляються з обох місць
                    одразу — і галочка, і збережені розміри, — інакше доповнення відроджувалося б
                    із того запису, який лишився. Видалили активну деталь — активною стає
                    стільниця.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'slab' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Слеби і дефекти</h1>
                <p className="text-slate-600 mb-6">
                  Слеб — конкретний лист каменю в проєкті: з артикулом 1С, габаритом і фото.
                  Деталі розкладаються по слебах, тому все, що розкрій мусить знати про лист —
                  розмір, дефекти, відступи безпеки — живе тут.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Search className="w-5 h-5" />} accent title="Слеб додається тільки з каталогу">
                    Зелена кнопка «Додати слеб» відкриває каталог номенклатур. Ручного вводу
                    «ширина-висота-декор» немає свідомо (з 25.08): слеб мусить нести <b>артикул
                    1С</b>, інакше за ним нема чого спитати ціну. Два джерела перемикачем у шапці:
                    <b> «ІТ · довідник»</b> — декори й артикули виконань (основне), <b>«WMS ·
                    склад»</b> — конкретні листи з габаритом і коміркою складу.
                  </HelpBlock>
                  <HelpShot src="/help/slabs/catalog.png" caption="Майстер на три кроки: картки декорів (серверний пошук по ~півтори тисячі позицій, фільтри матеріал/товщина/виробник) → виконання → підтвердження з артикулом, ціною і кількістю." />

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="Чому три кроки">
                    Картка декору лише ОБИРАЄ; додає окремий екран підтвердження, де ще раз
                    показано вибір, ціну і кількість — щоб менеджер бачив підсумок до кліку.
                    Виконання важливе: номенклатура 1С заведена окремо на кожну товщину, 12 і
                    20 мм того самого декору — два різні артикули з різними цінами.
                  </HelpBlock>

                  <HelpBlock icon={<Image className="w-5 h-5" />} title="Фото листа і авто-сколи">
                    До слеба вантажиться фото реального листа. З фото зчитується контур, і
                    <b> зрізані кути автоматично стають дефектами</b>: повторний аналіз того
                    самого фото не плодить дублікатів, а зони, заведені руками, автоматика не
                    чіпає ніколи. Скол іде з відступом безпеки (мінімальний відступ слеба):
                    камінь біля лінії розлому ослаблений, і деталь упритул не кладуть — пунктир
                    припуску на кресленні і дані кажуть одне й те саме.
                  </HelpBlock>
                  <HelpShot src="/help/slabs/defects.png" caption="Червоне — заборонені зони: ручна «тріщина по жилі» (тягається мишею, крапка міняє розмір) і авто-скол у куті з пунктиром відступу. Меню правого кліка по слебу — «Додати дефект»." />

                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} title="Дефект руками">
                    Правий клік по слебу на кресленні → «Додати дефект»: у точці кліка з'являється
                    червона зона, яку тягають мишею; крапка в куті міняє розмір. В «Інспекторі
                    слеба» дефекту задається форма (прямокутник, коло, трикутник, полігон) і
                    коментар — він піде в документи. Авто-скол мишею не тягається: його межа
                    прийшла зі знімка.
                  </HelpBlock>

                  <HelpBlock icon={<Lock className="w-5 h-5" />} title="Що це дає розкрою">
                    Рушій обходить усі дефектні зони: деталь не ляже ні на скол, ні в порожнечу
                    зрізаного кута. У пакеті для цеху і МЕС кожен дефект їде з походженням —
                    авто з фото чи заведений людиною — тож завжди видно, чому зона заборонена.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'corners' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Обробка кутів (Радіуси)</h1>
                <p className="text-slate-600 mb-6">
                  Кут деталі можна скруглити, зрізати або вирізати Г-подібно. Панель — список уже
                  заданих кутів: тип і розміри, «Редагувати» відкриває вікно, кошик прибирає.
                  Створюється обробка <b>плюсиком (+) на 2D кресленні</b> або <b>правим кліком по
                  куту в 3D</b> (режим «Редагування → Кути»).
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<RotateCw className="w-5 h-5" />} accent title="Три типи обробки">
                    <b>Радіус</b> — скруглення. <b>Кут (фаска)</b> — прямий зріз двома розмірами.
                    <b> Г-подібний виріз</b> — прямокутний заріз кута. Розміри зрізу підписані
                    іменами реальних сторін кута — «Розмір по A», «Розмір по B» — щоб не гадати,
                    вздовж чого міряти. Кут називається парою сусідніх сторін: AB, BC, CD…
                  </HelpBlock>
                  <HelpShot src="/help/corners/panel.png" caption="Ліворуч — список: BC скруглений радіусом 300, CD зрізаний фаскою 20×20. Праворуч — вікно обробки: тип, радіус, «Складний радіус», фрезерування." />

                  <HelpBlock icon={<Settings className="w-5 h-5" />} title="Радіус: попередження і «складний»">
                    Радіус менший за <b>100 мм</b> підсвічує попередження «узгодьте з технологом» —
                    прорахунок і розкрій воно не блокує, це нагадування. Галочка <b>«Складний
                    радіус»</b> — судження конструктора про нестандартну геометрію: піде в
                    прорахунок окремою позицією. Автомат класифікує за товщиною і висотою, але
                    позначка людини сильніша за автомат.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Що обробка кута тягне за собою">
                    Дуга радіуса — повноцінна сторона: у треї «Сторони» на неї можна повісити
                    потовщення чи підворот, і виросте гнутий елемент. Два великі радіуси можуть
                    з'їсти сторону повністю — тоді вона чесно зникає зі «Сторін». Ребра Г-вирізу
                    стають сторонами з іменами D1 тощо — з кромками і доповненнями, як у всіх.
                    І пам'ятайте з розділу «Кромки»: без обробки кута кромка через кут не
                    профілюється — фреза вибігає по дотичній.
                  </HelpBlock>

                  <HelpBlock icon={<Scissors className="w-5 h-5" />} title="Фрезерування торця">
                    Внизу вікна — позначка «Без фрезерування / Стандарт» для цеху: чи обробляти
                    торець по новому контуру кута. Це та сама позначка, що у вирізів.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'cutouts' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Вирізи (Обробка площин)</h1>
                <p className="text-slate-600 mb-6">
                  Виріз — наскрізний отвір у площині деталі: під розетку, під кран, довільний.
                  Деталь лишається цілою (на відміну від ніші, що розриває контур — вона в меню
                  сторін). Вирізи видно в 3D, на 2D кресленні й у документах для цеху.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} accent title="Вибір типу і є створенням">
                    Випадачка «+ Додати виріз…»: довільний прямокутний, довільний круглий, під
                    розетки, під крани. Щойно обрали — виріз <b>одразу з'являється в 3D</b>
                    (100×100, відступ 100/100 від першого кута) і далі правиться числами. Нічого
                    не треба «малювати»: поставили — посунули цифрами. Другий вхід — режим
                    «Редагування → Вирізи» в 3D: клік по площині деталі.
                  </HelpBlock>
                  <HelpShot src="/help/cutouts/panel.png" caption="Випадачка типів, рядок «Виріз (Розетка)» і форма, що розкрилась прямо під ним: прив'язка до кута, відстані від сторін, розміри, поворот." />

                  <HelpBlock icon={<Crosshair className="w-5 h-5" />} title="Прив'язка: від двох сторін кута">
                    Виріз міряється від <b>пари сторін</b> обраного кута («A і B»): дві відстані —
                    до краю вирізу, не до центру. Тому при зміні габаритів деталі виріз лишається
                    там, де ви його поставили відносно свого кута. У формі можна перевибрати кут
                    прив'язки — відстані перерахуються.
                  </HelpBlock>

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="Форма і поворот">
                    Прямокутний виріз: ширина, висота, радіус кутів, поворот у градусах. Круглий:
                    радіус. «Під розетки» і «під крани» — ті самі поля з типовими розмірами, але
                    в документах цеху вони підписані своїм призначенням.
                  </HelpBlock>

                  <HelpBlock icon={<Monitor className="w-5 h-5" />} title="Редагування — під своїм рядком">
                    Клік «Редагувати» розкриває форму <b>прямо під рядком вирізу</b>, рядок
                    підсвічується синім — завжди видно, який саме виріз правиться, навіть коли їх
                    п'ять. Зміни застосовуються одразу, «Згорнути» закриває. Позначка
                    «Фрезерування: Без / Стандарт» внизу — обробка торця вирізу для цеху.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'millings' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Фрезерування площини (Проточки для води)</h1>
                <p className="text-slate-600 mb-6">
                  Фрезерування <b>не на всю товщину</b>: проточки для стікання води біля врізної
                  мийки, декоративні канавки фасаду. Панель мислить <b>групами</b>, а не окремими
                  канавками — цех робить їх пачкою з одним кроком («п'ять штук через 50 мм»), тому
                  один рядок = одна фрезерувальна операція в бланку цеху.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Waves className="w-5 h-5" />} accent title="Головний шлях — каталог цеху">
                    Внизу — кнопки-коди пресетів «Проточки з каталогу цеху»: числа взяті з
                    реальних креслень, наведення показує склад (кількість, крок, фреза, глибини).
                    Іконка-креслення у шапці групи відкриває <b>першоджерело</b> — те саме
                    креслення цеху, з якого взяті числа: менеджер бачить оригінал, а не вірить
                    полям на слово. «Нетипові» — ручна група для нестандартних випадків.
                  </HelpBlock>
                  <HelpShot src="/help/millings/panel.png" caption="Група «Проточки для води»: кількість, крок, довжина, фреза (радіус і профіль), дві глибини (ухил до мийки), відступи. Внизу — вердикт здійсненності і кнопки пресетів." />

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="Поля групи">
                    Кількість × довжина, крок між осями, радіус фрези і профіль (кругле дно /
                    клин / плоске дно), <b>дві глибини</b> — біля мийки і на краю: різниця дає
                    ухил, яким вода стікає. Відступи X/Y — від лівого верхнього кута деталі,
                    напрямок — горизонтально чи вертикально.
                  </HelpBlock>

                  <HelpBlock icon={<Lock className="w-5 h-5" />} title="Здійсненність перевіряється одразу">
                    Під полями — вердикт: слід фрези в мм, <b>скільки каменю лишається під
                    дном</b> канавки, погонні метри. Помилка показується червоним ДО того, як ви
                    пообіцяли щось клієнту; тоді ж прямо написано: «наявними послугами цю обробку
                    виконати неможливо — зверніться до технолога». Жовті попередження не блокують.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'sink' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Встановлення мийки в виріб</h1>
                <p className="text-slate-600 mb-6">
                  Мийка нижнього монтажу вставляється у стільницю однією дією: «+ Додати мийку»
                  створює чашу І виріз під неї одночасно — окремо різати отвір не треба. Виріз у
                  стільниці будується автоматично за внутрішнім контуром чаші; чаша підклеюється
                  знизу.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Box className="w-5 h-5" />} accent title="Чаша: прямокутна або щілинна">
                    Тип обирається у випадачці картки. Розміри — довжина, ширина і глибина чаші.
                    Мийок у виробі може бути кілька — кожна своєю карткою зі своїм кошиком.
                  </HelpBlock>
                  <HelpShot src="/help/sink/panel.png" caption="Картка мийки: тип чаші, прив'язка до сторін, відстані ВІД СТОРІН (не від кута), розміри чаші, поворот. Під полями — нагадування, що виріз будується сам." />

                  <HelpBlock icon={<Crosshair className="w-5 h-5" />} title="Позиція: від сторін, з поворотом">
                    Обираєте кут прив'язки — і дві відстані міряються <b>від сторін цього кута</b>
                    до чаші (саме від сторін, не від точки кута). Поворот у градусах, можна
                    від'ємний — отвір у стільниці повертається разом із чашею.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Що відбувається далі само">
                    Заготовки чаші (тип «Мийка») потрапляють у розкрій автоматично і в цеху
                    збираються в чашу — у пакеті для МЕС вони їдуть однією склейкою. Виріз під
                    чашу видно в кресленнях і документах. <b>Решітка зливу</b> (різ водою в дні)
                    редагується не тут, а на самій мийці в дереві виробу — вона належить дну чаші.
                  </HelpBlock>
                </div>
              </div>
            )}

            {activeSection === 'joints' && (
              <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                <h1 className="text-2xl font-bold mb-2 text-slate-800 border-b pb-4">Стики між деталями</h1>
                <p className="text-slate-600 mb-6">
                  Стик — це місце, де виріб ріжеться на дві деталі і потім склеюється в цеху.
                  Ставлять його, коли деталь більша за сляб, коли ріжемо із залишку або коли шов
                  вигідніше вивести в конкретне місце (під мийку, за плиту, у кут). Стик — це різ,
                  а не декор: він додає два торці, які потрапляють у розкрій, кошторис і креслення.
                </p>

                <div className="space-y-6">
                  <HelpBlock icon={<Split className="w-5 h-5" />} accent title="Стик ставиться в 3D, у режимі «Стики»">
                    Відкрийте деталь (подвійний клік по ній) і ввімкніть <b>«Стики»</b> в тулбарі над
                    моделлю — або просто розгорніть секцію «Стики (З'єднання деталей)» справа: вона
                    вмикає режим сама. Це <b>єдине</b> місце створення стику. Старих кнопок
                    «+ Вертикальний / + Горизонтальний» більше немає: вони ставили різ наосліп, лише
                    за координатою, і на Г- та П-подібній деталі такий різ ішов наскрізь через усі
                    виступи.
                  </HelpBlock>

                  <HelpBlock icon={<MousePointerSquareDashed className="w-5 h-5" />} title="Бейдж пари сторін">
                    У режимі «Стики» на кожній парі протилежних сторін стоїть бурштиновий бейдж із
                    буквою. Пара — це і є адреса стику: різ піде <b>від однієї сторони до другої</b> і
                    тільки в межах їхнього спільного поля. Тому на П-подібній стільниці у верхньої
                    сторони пар декілька — по одній на кожну ногу, і різ у лівій нозі не чіпає праву.
                  </HelpBlock>

                  <HelpBlock icon={<Crosshair className="w-5 h-5" />} title="Наведення: поле, лінійка, лінія різу">
                    Наведіть на бейдж — підсвітиться поле цієї пари, з'явиться лінія майбутнього різу,
                    а <b>жовтим</b> засвітиться сторона, від якої рахується відступ (сторона-лінійка).
                    Вона ж стоїть жовтим чипом у віконці відступу — щоб не було сумнівів, від чого
                    міряємо.
                  </HelpBlock>

                  <HelpBlock icon={<Ruler className="w-5 h-5" />} title="Клік: відступ і Enter">
                    Клацніть бейдж — відкриється віконце з полем відступу (фокус уже в ньому).
                    Введіть міліметри від підсвіченої сторони і натисніть <b>Enter</b>. Стик
                    з'явиться в списку секції «Стики»: там його можна переміряти <b>від кута</b>
                    (випадачка «Від краю деталі / Від кута …»), змінити відстань або видалити
                    кошиком.
                  </HelpBlock>

                  <HelpBlock icon={<Waves className="w-5 h-5" />} title="Коли стик посунеться сам">
                    Якщо на заданій відстані різ потрапляє на дугу скруглення, деталь звузилась би
                    там у нуль і вістря лопнуло б при різі. Тоді в картці стику з'являється
                    бурштинова записка «стик буде посунуто на … мм» — програма відводить різ від дуги
                    і чесно каже, куди саме. На увігнутому куті Г- і П-форми з радіусом окремо
                    питається, <b>кому дістається дуга</b> — вести стик по ній не можна.
                  </HelpBlock>

                  <HelpBlock icon={<Layers className="w-5 h-5" />} title="Що стик тягне за собою">
                    Після стику деталь у розкрої стає двома деталями, у кожної з'являється торець по
                    шву. Ці торці видно в кресленнях і в специфікації; кромку на шов зазвичай не
                    ставлять — його склеюють. Перевірити результат найпростіше на 2D кресленні
                    деталі: там та сама пара сторін і та сама лінія різу, що й у 3D.
                  </HelpBlock>
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
            
            {/* Плейсхолдер «Розділ у розробці» прибраний 11.09: умова була
                інвертована і ДОДАВАЛА його під повні розділи (кромки, розміри,
                стики…) при прокрутці вниз. Порожніх розділів більше немає. */}
          </div>
        </div>
      </div>
    </div>
  );
}
