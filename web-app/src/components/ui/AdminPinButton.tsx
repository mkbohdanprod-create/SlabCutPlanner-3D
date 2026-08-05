import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, ShieldCheck, X, Lock, Unlock } from 'lucide-react';
import { useUIStore } from '../../store/useStore';
import { useSettingsStore } from '../../store/useSettingsStore';

/**
 * Кнопка супер-адміна в шапці.
 *
 * За PIN-кодом ховаються адмінські меню — шестерні налаштувань прайсів
 * і прив'язок. Це запобіжник від випадкових рук, а не безпека: PIN
 * лежить у localStorage поруч із самими налаштуваннями. Розблокування
 * живе, поки відкрите вікно (не переживає перезавантаження) — свідомо.
 */

const inputCls = 'border border-slate-300 rounded-md px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[#0084ff]';

export function AdminPinButton() {
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const setAdminUnlocked = useUIStore((s) => s.setAdminUnlocked);

  /**
   * Блокування прибирає не лише кнопки, а й уже ВІДКРИТІ адмінські види:
   * інакше «Послуги для виробництва» лишились би на екрані без вкладки,
   * якою їх можна закрити.
   */
  const lock = () => {
    const ui = useUIStore.getState();
    if (ui.mainView === 'estimate') ui.setMainView('2d');
    if (ui.splitLeftView === 'estimate') ui.setSplitLeftView('2d');
    if (ui.splitRightView === 'estimate') ui.setSplitRightView('2d');
    if (ui.isFloatingPreviewOpen) ui.setFloatingPreviewOpen(false);
    if (ui.isSettingsOpen) ui.setIsSettingsOpen(false);
    setAdminUnlocked(false);
  };
  const adminPin = useSettingsStore((s) => s.adminPin);
  const setAdminPin = useSettingsStore((s) => s.setAdminPin);

  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinSaved, setPinSaved] = useState(false);

  const close = () => {
    setOpen(false);
    setPin('');
    setError(false);
    setNewPin('');
    setPinSaved(false);
  };

  const tryUnlock = () => {
    if (pin === adminPin) {
      setAdminUnlocked(true);
      close();
    } else {
      setError(true);
      setPin('');
    }
  };

  const saveNewPin = () => {
    const clean = newPin.trim();
    if (!/^\d{4,8}$/.test(clean)) return;
    setAdminPin(clean);
    setNewPin('');
    setPinSaved(true);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors shadow-sm ${
          isAdminUnlocked
            ? '!text-white !bg-emerald-600 hover:!bg-emerald-700'
            : '!text-white !bg-[#0084ff] hover:!bg-[#006bce]'
        }`}
        title={isAdminUnlocked ? 'Супер-адмін: розблоковано' : 'Супер-адмін: вхід за PIN-кодом'}
      >
        {isAdminUnlocked
          ? <ShieldCheck className="w-[18px] h-[18px] stroke-[2.5]" />
          : <Shield className="w-[18px] h-[18px] stroke-[2.5]" />}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 font-sans" onClick={close}>
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-xs flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                {isAdminUnlocked
                  ? <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  : <Shield className="w-5 h-5 text-[#0084ff]" />}
                <h2 className="text-base font-semibold text-gray-800">Супер-адмін</h2>
              </div>
              <button onClick={close} className="text-gray-500 hover:text-gray-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isAdminUnlocked ? (
              <div className="p-5 flex flex-col gap-3">
                <p className="text-sm text-slate-600">Введіть PIN-код, щоб показати адмінські меню.</p>
                <input
                  className={`${inputCls} ${error ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={8}
                  value={pin}
                  placeholder="••••"
                  onChange={(event) => { setPin(event.target.value.replace(/\D/g, '')); setError(false); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') tryUnlock(); }}
                />
                {error && <p className="text-sm text-red-600 text-center">Невірний PIN</p>}
                <button
                  onClick={tryUnlock}
                  disabled={!pin}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors disabled:bg-slate-300"
                >
                  <Unlock className="w-4 h-4" /> Розблокувати
                </button>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4">
                <p className="text-sm text-emerald-700 font-semibold">Адмінські меню показано.</p>
                <button
                  onClick={() => { lock(); close(); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-md text-sm font-bold hover:bg-slate-800 transition-colors"
                >
                  <Lock className="w-4 h-4" /> Заблокувати
                </button>

                <div className="border-t pt-3 flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Змінити PIN (4–8 цифр)</label>
                  <div className="flex gap-2">
                    <input
                      className={`${inputCls} flex-1 min-w-0`}
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={newPin}
                      placeholder="новий PIN"
                      onChange={(event) => { setNewPin(event.target.value.replace(/\D/g, '')); setPinSaved(false); }}
                      onKeyDown={(event) => { if (event.key === 'Enter') saveNewPin(); }}
                    />
                    <button
                      onClick={saveNewPin}
                      disabled={!/^\d{4,8}$/.test(newPin.trim())}
                      className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md text-sm font-bold hover:bg-slate-50 disabled:text-slate-300"
                    >
                      Зберегти
                    </button>
                  </div>
                  {pinSaved && <p className="text-xs text-emerald-600">PIN змінено.</p>}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
