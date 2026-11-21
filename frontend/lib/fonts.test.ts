jest.mock('next/font/google', () => ({
  Inter: jest.fn(() => ({ className: 'inter', variable: '--font-sans' })),
}));

import { Inter } from 'next/font/google';
import { uiFont } from './fonts';
import config from '../tailwind.config';

describe('UI font (F-151)', () => {
  it('loads Inter with latin subset, swap display and the --font-sans variable', () => {
    expect(Inter).toHaveBeenCalledWith({
      subsets: ['latin'],
      display: 'swap',
      variable: '--font-sans',
    });
    expect(uiFont.variable).toBe('--font-sans');
  });

  it('wires the font variable into Tailwind font-sans before the system fallbacks', () => {
    const sans = config.theme?.extend?.fontFamily?.sans as string[];
    expect(sans[0]).toBe('var(--font-sans)');
    expect(sans).toEqual(expect.arrayContaining(['system-ui', 'sans-serif']));
  });

  it('defines a type scale with tabular-number tokens for amounts and odds', () => {
    const sizes = config.theme?.extend?.fontSize as Record<string, [string, { lineHeight: string; fontVariantNumeric?: string }]>;
    expect(Object.keys(sizes)).toEqual(expect.arrayContaining(['title', 'label', 'amount']));
    expect(sizes.amount[1].fontVariantNumeric).toBe('tabular-nums');
  });
});
