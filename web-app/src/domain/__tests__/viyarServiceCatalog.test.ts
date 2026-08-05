import { describe, it, expect } from 'vitest';
import {
  VIYAR_SERVICES,
  VIYAR_SERVICE_COUNT,
  viyarCatalog,
  viyarToServiceDefinition,
} from '../viyarServiceCatalog';

// Довідник згенеровано з excel_dump.csv. Тести стежать, щоб генерація не
// з'їхала: коди унікальні, одиниці нормалізовані, матеріальні групи
// проставлені там, де номенклатура подвоєна.

describe('довідник ВіярПро', () => {
  it('178 позицій: 100 зі старого прайсу + 78 актуальних 2026', () => {
    expect(VIYAR_SERVICE_COUNT).toBe(178);
    expect(VIYAR_SERVICES).toHaveLength(178);
  });

  it('послуги 2026 на місці: PANDA, пильний центр, полірування', () => {
    const byCode = (code: string) => VIYAR_SERVICES.find((i) => i.code === code);
    expect(byCode('203099')?.name).toContain('AR20');          // кромка AR20 на керамограніті
    expect(byCode('259771')?.name).toContain('Комбінована');   // диск + вода одним вектором
    expect(byCode('195717')?.name).toContain('Антик');         // алмазні щітки
    expect(byCode('203118')?.materialGroup).toBe('Кварцит');   // чистовий 45 т.20
    expect(byCode('203103')?.materialGroup).toBe('Керамограніт');
  });

  it('код 224675 у прайсі-джерелі задубльований — у каталозі рівно один', () => {
    expect(VIYAR_SERVICES.filter((i) => i.code === '224675')).toHaveLength(1);
  });

  it('облікові коди унікальні', () => {
    const codes = VIYAR_SERVICES.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('коди — це числа з прайсу, а не вигадані рядки', () => {
    VIYAR_SERVICES.forEach((item) => {
      expect(item.code, item.name).toMatch(/^\d{5,7}$/);
    });
  });

  it('одиниці зведені до трьох, які розуміє рушій', () => {
    const units = new Set(VIYAR_SERVICES.map((item) => item.unit));
    expect([...units].sort()).toEqual(['m', 'm2', 'pcs']);
  });

  it('у прайсі «м.п.», «м.пог» і «м.пог.» — це одне й те саме', () => {
    // 195299 Обпил листа — м.п.; 195339 Підрізка плінтусів — м.пог
    expect(VIYAR_SERVICES.find((i) => i.code === '195299')?.unit).toBe('m');
    expect(VIYAR_SERVICES.find((i) => i.code === '195339')?.unit).toBe('m');
    // 195391 Косметичні роботи — м.кв
    expect(VIYAR_SERVICES.find((i) => i.code === '195391')?.unit).toBe('m2');
  });

  it('матеріальна група розводить подвоєні позиції', () => {
    // Калібрування: 242499 керамограніт / 242504 кварцит
    expect(VIYAR_SERVICES.find((i) => i.code === '242499')?.materialGroup).toBe('Керамограніт');
    expect(VIYAR_SERVICES.find((i) => i.code === '242504')?.materialGroup).toBe('Кварцит');
    // Вибірка чверті: 224022 / 224063
    expect(VIYAR_SERVICES.find((i) => i.code === '224022')?.materialGroup).toBe('Керамограніт');
    expect(VIYAR_SERVICES.find((i) => i.code === '224063')?.materialGroup).toBe('Кварцит');
  });

  it('конструкторські послуги — інженерна категорія, решта додаткових — ручна', () => {
    expect(VIYAR_SERVICES.find((i) => i.code === '219967')?.category).toBe('engineering');
    expect(VIYAR_SERVICES.find((i) => i.code === '219997')?.category).toBe('engineering');
    expect(VIYAR_SERVICES.find((i) => i.code === '219969')?.category).toBe('manual');
  });

  it('верстат збережений там, де він указаний', () => {
    expect(VIYAR_SERVICES.find((i) => i.code === '195300')?.equipment).toBe('Breton Combicut');
    expect(VIYAR_SERVICES.find((i) => i.code === '219977')?.equipment).toBe('Combicat');
    expect(VIYAR_SERVICES.find((i) => i.code === '242499')?.equipment).toBe('NC300');
  });

  it('усі чотири розділи прайсу представлені', () => {
    const sections = new Set(VIYAR_SERVICES.map((item) => item.section));
    expect(sections).toContain('Порізка');
    expect(sections).toContain('Фрезерування');
    expect(sections).toContain('Обробка торців');
    expect(sections).toContain('Додаткові послуги');
  });
});

describe('перетворення в каталог', () => {
  it('id послуги дорівнює обліковому коду', () => {
    const service = viyarToServiceDefinition(VIYAR_SERVICES[0]);
    expect(service.id).toBe(VIYAR_SERVICES[0].code);
    expect(service.externalId).toBe(VIYAR_SERVICES[0].code);
  });

  it('ціна нульова — тарифів у довіднику немає', () => {
    Object.values(viyarCatalog()).forEach((service) => {
      expect(service.price, service.name).toBe(0);
    });
  });

  it('каталог містить рівно 178 записів', () => {
    expect(Object.keys(viyarCatalog())).toHaveLength(178);
  });

  it('назви не порожні', () => {
    Object.values(viyarCatalog()).forEach((service) => {
      expect(service.name.length).toBeGreaterThan(3);
    });
  });
});
