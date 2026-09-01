import { useEffect, useState } from 'react';
import type { SlabInstance } from '../../../domain/types';
import { slabOutlineFor, type SlabOutline } from '../../../engines/slabOutline';

/**
 * Контури натуральних слебів для дошки розкрою.
 *
 * Аналізуються ТІЛЬКИ фото натурального каменю: рівний керамограніт або
 * кварцит різати по контуру немає сенсу, а зайвий прохід по пікселях на
 * кожне фото — марна робота. Результат кешується за адресою знімка в
 * самому движку, тож повторні відкриття проєкту нічого не перераховують.
 *
 * Хук нічого не пише в проєкт — він лише дивиться. Проставлянням дефектів
 * займається окремий крок (див. useAutoCornerDefects): читання і зміна
 * даних не змішуються в одному місці.
 */
export function useSlabOutlines(slabs: SlabInstance[]): Record<string, SlabOutline | null> {
  const [outlines, setOutlines] = useState<Record<string, SlabOutline | null>>({});

  // Ключ від складу «слеб → фото»: перерахунок потрібен лише коли
  // з'явився новий слеб або замінили знімок, а не на кожен рендер дошки.
  const signature = slabs
    .filter((slab) => slab.material === 'Натуральний камінь' && slab.photo)
    .map((slab) => `${slab.id}:${slab.photo?.length ?? 0}`)
    .join('|');

  useEffect(() => {
    let alive = true;
    const targets = slabs.filter((slab) => slab.material === 'Натуральний камінь' && slab.photo);
    if (!targets.length) { setOutlines({}); return undefined; }

    Promise.all(targets.map((slab) => slabOutlineFor(slab.photo as string)
      .then((outline) => [slab.id, outline] as const)))
      .then((pairs) => {
        if (!alive) return;
        setOutlines(Object.fromEntries(pairs));
      });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return outlines;
}
