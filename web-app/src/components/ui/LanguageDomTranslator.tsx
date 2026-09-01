import { useEffect } from 'react';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import type { UiLanguage } from '../../domain/types';

/**
 * ПЕРЕКЛАД ІНТЕРФЕЙСУ ПРЯМО В DOM.
 *
 * Компоненти пишуться українською і нічим не обгортаються: цей сторож
 * обходить готове дерево і підміняє текст вузлів та підписи
 * aria-label / title / placeholder за словником `staticUiText`.
 * Ціна такого рішення — збіг має бути ТОЧНИМ по всьому тексту вузла,
 * тому рядок, склеєний шаблоном зі змінною, перекласти неможливо.
 *
 * Три речі, на яких воно ламалося і які тепер тримають тести/коментарі:
 *
 *  1. КОРІНЬ. Раніше шукали `.app-shell` — такого елемента в розмітці немає
 *     (лишився тільки в CSS), тому перекладач тихо виходив і жодна мова,
 *     крім української, не працювала. Корінь — `document.body`: у ньому і
 *     застосунок, і портали модалок.
 *
 *  2. ПОВТОРНИЙ РЕНДЕР. React може переписати той самий текстовий вузол
 *     новим українським текстом уже ПІСЛЯ нашої правки. Якщо сліпо вірити
 *     збереженому джерелу, ми затрем свіжий текст старим перекладом. Тому
 *     пам'ятаємо не лише джерело, а й те, що самі записали: якщо в вузлі
 *     лежить не наш запис — значить, текст новий, і джерело теж нове.
 *
 *  3. ЦІНА СПОСТЕРЕЖЕННЯ. Обхід усього дерева на кожну мутацію в застосунку
 *     з 3D і перетягуванням деталей — це помітні гальма. Тому мутації
 *     збираються і опрацьовуються пачкою раз на кадр, і тільки ті піддерева,
 *     які справді змінилися.
 */

const ATTRIBUTES = ['aria-label', 'title', 'placeholder'] as const;
const SKIP_SELECTOR = 'script, style, code, pre, [data-i18n-skip="true"]';

type I18nText = Text & { __i18nSource?: string; __i18nApplied?: string };

function translateTextNode(node: I18nText, language: UiLanguage) {
  const current = node.nodeValue ?? '';
  const source = node.__i18nSource !== undefined && node.__i18nApplied === current
    ? node.__i18nSource
    : current;
  const next = translateStaticUiText(language, source);
  node.__i18nSource = source;
  node.__i18nApplied = next;
  if (next !== current) node.nodeValue = next;
}

function translateAttributes(element: Element, language: UiLanguage) {
  if (element.closest(SKIP_SELECTOR)) return;
  ATTRIBUTES.forEach((attribute) => {
    const current = element.getAttribute(attribute);
    if (!current) return;
    const sourceAttr = `data-i18n-${attribute}-source`;
    const appliedAttr = `data-i18n-${attribute}-applied`;
    const stored = element.getAttribute(sourceAttr);
    const source = stored !== null && element.getAttribute(appliedAttr) === current
      ? stored
      : current;
    const next = translateStaticUiText(language, source);
    if (next === current) {
      // Перекладу немає (або ми вже українською) — нема чого стерегти,
      // і немає сенсу вішати службові атрибути на кожну кнопку в застосунку.
      if (stored !== null) {
        element.removeAttribute(sourceAttr);
        element.removeAttribute(appliedAttr);
      }
      return;
    }
    element.setAttribute(sourceAttr, source);
    element.setAttribute(appliedAttr, next);
    element.setAttribute(attribute, next);
  });
}

function translateSubtree(root: Element, language: UiLanguage) {
  if (root.closest(SKIP_SELECTOR)) return;
  translateAttributes(root, language);
  root.querySelectorAll('*').forEach((element) => translateAttributes(element, language));

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) return;
    translateTextNode(node, language);
  });
}

export function LanguageDomTranslator() {
  const language = useProjectStore((state) => state.project.uiLanguage ?? 'uk');

  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.body;
    if (!root) return undefined;

    const pending = new Set<Node>();
    let frame = 0;

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'characterData') pending.add(record.target);
        else if (record.type === 'attributes') pending.add(record.target);
        else record.addedNodes.forEach((node) => pending.add(node));
      });
      if (pending.size && !frame) frame = requestAnimationFrame(flush);
    });

    const observe = () => observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });

    function flush() {
      frame = 0;
      const batch = Array.from(pending);
      pending.clear();
      // Власні правки не мають будити спостерігача ще раз.
      observer.disconnect();
      batch.forEach((node) => {
        if (!node.isConnected) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = (node as Text).parentElement;
          if (parent && parent.closest(SKIP_SELECTOR)) return;
          translateTextNode(node as I18nText, language);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateSubtree(node as Element, language);
        }
      });
      observe();
    }

    translateSubtree(root, language);
    observe();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [language]);

  return null;
}
