import { useEffect } from 'react';
import { translateStaticUiText } from '../i18n';
import { useProjectStore } from '../store/useProjectStore';

const ATTRIBUTES = ['aria-label', 'title', 'placeholder'];

function translateTextNode(node: Text, language: ReturnType<typeof useProjectStore.getState>['project']['uiLanguage']) {
  const current = node.nodeValue ?? '';
  const source = (node as Text & { __i18nSource?: string }).__i18nSource ?? current;
  const next = translateStaticUiText(language, source);
  if (next === source && current !== source) {
    node.nodeValue = source;
    return;
  }
  if (next !== current) {
    (node as Text & { __i18nSource?: string }).__i18nSource = source;
    node.nodeValue = next;
  }
}

function translateAttributes(element: Element, language: ReturnType<typeof useProjectStore.getState>['project']['uiLanguage']) {
  if (element.closest('[data-i18n-skip="true"]')) return;
  ATTRIBUTES.forEach((attribute) => {
    const current = element.getAttribute(attribute);
    if (!current) return;
    const sourceAttr = `data-i18n-${attribute}-source`;
    const source = element.getAttribute(sourceAttr) ?? current;
    const next = translateStaticUiText(language, source);
    if (next === source && current !== source) {
      element.setAttribute(attribute, source);
      return;
    }
    if (next !== current) {
      element.setAttribute(sourceAttr, source);
      element.setAttribute(attribute, next);
    }
  });
}

function translateRoot(root: Element, language: ReturnType<typeof useProjectStore.getState>['project']['uiLanguage']) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, input, textarea, [data-i18n-skip="true"]')) return;
    translateTextNode(node, language);
  });
  root.querySelectorAll('*').forEach((element) => translateAttributes(element, language));
}

export function LanguageDomTranslator() {
  const language = useProjectStore((state) => state.project.uiLanguage ?? 'uk');

  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.querySelector('.app-shell');
    if (!root) return undefined;
    let translating = false;
    const run = () => {
      if (translating) return;
      translating = true;
      translateRoot(root, language);
      translating = false;
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
}
