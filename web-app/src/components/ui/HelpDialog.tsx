import  { useEffect, useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { X, Book, LayoutDashboard, Scissors, Box, Layers, Settings,  Trash2, FolderOpen, Save, FileText, Image, Search, Ruler, Monitor, MousePointerSquareDashed, Eraser, Copy, Lock } from 'lucide-react';

type HelpSection = 'main' | 'quick' | '2d' | 'product_editor' | 'edges' | '3d_editor' | '3d_preview' | 'slab' | 'parts' | 'texture';

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
              onClick={() => setActiveSection('product_editor')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'product_editor' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Ruler className="w-4 h-4" /> Редактор виробу
            </button>
            <button 
              onClick={() => setActiveSection('edges')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeSection === 'edges' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <Scissors className="w-4 h-4" /> Кромки і торці
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
