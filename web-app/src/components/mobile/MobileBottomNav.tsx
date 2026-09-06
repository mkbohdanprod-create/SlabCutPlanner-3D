import { Layers, Box, Image, Calculator, SlidersHorizontal, Map, Grid3x3, Table2 } from 'lucide-react';
import { useUIStore, type MainView, type PaneView } from '../../store/useStore';

/**
 * Нижня навігація — головний орган керування на телефоні.
 *
 * Чому внизу: великий палець природно лежить у нижній третині екрана.
 * Усе, до чого тягнешся десятки разів за прорахунок, має бути там.
 *
 * П'ять цілей — межа, за якою вони стають вужчими за подушечку пальця
 * (рекомендована мінімальна ціль 44 px, на 360-px екрані п'ять по 72 px).
 * «Спліт» сюди свідомо не потрапив: дві панелі поруч на телефоні
 * безглузді, і на мобільному він вимкнений.
 */

interface Props {
  view: MainView;
  onChange: (v: PaneView) => void;
  onOpenTools: () => void;
  toolsOpen: boolean;
}

const TABS: { id: PaneView; label: string; Icon: typeof Layers }[] = [
  { id: '2d', label: 'Розкрій', Icon: Layers },
  { id: '3d', label: '3D', Icon: Box },
  { id: 'texture', label: 'Текстура', Icon: Image },
  { id: 'quote', label: 'Прорахунок', Icon: Calculator },
];

/** АРХІТЕКТОР (06.09): на телефоні — план, розкладка, розкрій, відомість. */
const ARCHITECTURE_TABS: { id: PaneView; label: string; Icon: typeof Layers }[] = [
  { id: 'plan', label: 'План', Icon: Map },
  { id: 'layout', label: 'Розкладка', Icon: Grid3x3 },
  { id: '2d', label: 'Розкрій', Icon: Layers },
  { id: 'boq', label: 'Відомість', Icon: Table2 },
];

export function MobileBottomNav({ view, onChange, onOpenTools, toolsOpen }: Props) {
  const architectureMode = useUIStore((s) => s.architectureMode);
  const tabs = architectureMode ? ARCHITECTURE_TABS : TABS;
  return (
    <nav className="m-nav" aria-label="Основна навігація">
      {tabs.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            className={`m-nav__item${active ? ' is-active' : ''}`}
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}

      <button
        className={`m-nav__item m-nav__item--tools${toolsOpen ? ' is-active' : ''}`}
        onClick={onOpenTools}
        aria-expanded={toolsOpen}
      >
        <SlidersHorizontal size={21} strokeWidth={toolsOpen ? 2.4 : 1.9} />
        <span>Панель</span>
      </button>
    </nav>
  );
}
