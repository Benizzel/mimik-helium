// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { isTooLarge } from '../element-utils';

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

function makeElement(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
  });
  return el;
}

describe('isTooLarge', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  });

  it('reports a full-width banner as too large even when it is short', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH, VIEWPORT_HEIGHT * 0.1))).toBe(true);
  });

  it('reports a full-height sidebar as too large even when it is narrow', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.1, VIEWPORT_HEIGHT))).toBe(true);
  });

  it('reports a small element as not too large', () => {
    expect(isTooLarge(makeElement(120, 40))).toBe(false);
  });

  it('does not report an element sitting exactly at the 0.8 ratio', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.8, VIEWPORT_HEIGHT * 0.8))).toBe(false);
  });

  it('reports an element just past the 0.8 width ratio', () => {
    expect(isTooLarge(makeElement(VIEWPORT_WIDTH * 0.81, 40))).toBe(true);
  });
});
