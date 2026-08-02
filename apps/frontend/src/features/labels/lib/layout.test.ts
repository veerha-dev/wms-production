/**
 * Label geometry. Two things are being defended here:
 *
 *  - the mm → pixel conversion, because a symbol rasterised below ~300 DPI for
 *    its printed size is one a handheld scanner will not read; and
 *  - the grid maths, because the "128 labels, 6 pages" line in the dialog is a
 *    promise about how much stock the run consumes, and the PDF generator
 *    throws if the two disagree.
 */
import { describe, expect, it } from 'vitest';

import {
  computeA4Grid,
  computeGrid,
  computeLabelBoxes,
  computeThermalGrid,
  countPages,
  estimateRun,
  mmToPx,
  ptToMm,
  pxToMm,
  slotPosition,
} from './layout';
import { LABEL_DIMENSIONS_MM, PRINT_DPI } from '../constants';
import type { LabelSize } from '../types';

describe('mm → pixel conversion', () => {
  it('converts one inch to exactly the DPI', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(25.4, 96)).toBe(96);
  });

  it('defaults to the 300 DPI print target', () => {
    expect(mmToPx(25.4)).toBe(PRINT_DPI);
  });

  it('scales with the physical size rather than assuming a fixed pixel count', () => {
    // The whole point: a 99 mm label needs ~2.6× the pixels of a 38 mm one to
    // print at the same dot density.
    const small = mmToPx(LABEL_DIMENSIONS_MM.small.width);
    const large = mmToPx(LABEL_DIMENSIONS_MM.large.width);
    expect(large / small).toBeCloseTo(99.1 / 38.1, 2);
  });

  it('reaches at least 300 DPI for every label size', () => {
    (['small', 'medium', 'large'] as LabelSize[]).forEach((size) => {
      const { width } = LABEL_DIMENSIONS_MM[size];
      const px = mmToPx(width);
      const achievedDpi = px / (width / 25.4);
      expect(achievedDpi).toBeGreaterThanOrEqual(300);
    });
  });

  it('never returns a zero-pixel image, however small the box', () => {
    expect(mmToPx(0)).toBe(1);
    expect(mmToPx(0.001)).toBe(1);
  });

  it('round-trips back to millimetres', () => {
    expect(pxToMm(mmToPx(50, 300), 300)).toBeCloseTo(50, 1);
  });

  it('converts points to millimetres', () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 5);
  });
});

describe('A4 grid', () => {
  it('tiles small labels 5 × 13 = 65 per sheet, matching Avery L7651', () => {
    const grid = computeA4Grid('small');
    expect(grid.columns).toBe(5);
    expect(grid.rows).toBe(13);
    expect(grid.perPage).toBe(65);
  });

  it('tiles medium labels 3 × 7 = 21 per sheet, matching Avery L7160', () => {
    const grid = computeA4Grid('medium');
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(7);
    expect(grid.perPage).toBe(21);
  });

  it('tiles large labels 2 × 4 = 8 per sheet, matching Avery L7165', () => {
    const grid = computeA4Grid('large');
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(4);
    expect(grid.perPage).toBe(8);
  });

  it('keeps the whole grid inside the page', () => {
    (['small', 'medium', 'large'] as LabelSize[]).forEach((size) => {
      const grid = computeA4Grid(size);
      expect(grid.offsetXMm).toBeGreaterThanOrEqual(0);
      expect(grid.offsetYMm).toBeGreaterThanOrEqual(0);
      expect(grid.offsetXMm * 2 + grid.columns * grid.labelWidthMm).toBeCloseTo(210, 5);
      expect(grid.offsetYMm * 2 + grid.rows * grid.labelHeightMm).toBeCloseTo(297, 5);
    });
  });
});

describe('thermal grid', () => {
  it('makes the page the label, one per page, with no margin', () => {
    const grid = computeThermalGrid('large');
    expect(grid.perPage).toBe(1);
    expect(grid.pageWidthMm).toBe(LABEL_DIMENSIONS_MM.large.width);
    expect(grid.pageHeightMm).toBe(LABEL_DIMENSIONS_MM.large.height);
    expect(grid.offsetXMm).toBe(0);
    expect(grid.offsetYMm).toBe(0);
  });

  it('is what computeGrid returns for the thermal format', () => {
    expect(computeGrid('medium', 'thermal')).toEqual(computeThermalGrid('medium'));
    expect(computeGrid('medium', 'a4')).toEqual(computeA4Grid('medium'));
  });
});

describe('pagination', () => {
  it('rounds a partial page up', () => {
    expect(countPages(1, 21)).toBe(1);
    expect(countPages(21, 21)).toBe(1);
    expect(countPages(22, 21)).toBe(2);
    expect(countPages(42, 21)).toBe(2);
    expect(countPages(43, 21)).toBe(3);
  });

  it('needs no pages for no labels', () => {
    expect(countPages(0, 21)).toBe(0);
    expect(countPages(-5, 21)).toBe(0);
  });

  it('gives 128 medium A4 labels 7 pages', () => {
    const estimate = estimateRun(128, {
      symbolType: 'qr',
      labelSize: 'medium',
      printFormat: 'a4',
      includeHumanReadable: true,
    });
    expect(estimate.perPage).toBe(21);
    expect(estimate.pages).toBe(7);
  });

  it('gives 128 small A4 labels 2 pages', () => {
    expect(
      estimateRun(128, {
        symbolType: 'barcode',
        labelSize: 'small',
        printFormat: 'a4',
        includeHumanReadable: true,
      }).pages,
    ).toBe(2);
  });

  it('gives a thermal run one page per label', () => {
    const estimate = estimateRun(128, {
      symbolType: 'qr',
      labelSize: 'medium',
      printFormat: 'thermal',
      includeHumanReadable: true,
    });
    expect(estimate.perPage).toBe(1);
    expect(estimate.pages).toBe(128);
  });
});

describe('slot positions', () => {
  const grid = computeA4Grid('medium'); // 3 × 7

  it('fills left to right, then top to bottom', () => {
    expect(slotPosition(0, grid)).toMatchObject({ page: 0 });
    expect(slotPosition(1, grid).xMm).toBeCloseTo(grid.offsetXMm + grid.labelWidthMm, 5);
    expect(slotPosition(1, grid).yMm).toBeCloseTo(grid.offsetYMm, 5);
    expect(slotPosition(3, grid).xMm).toBeCloseTo(grid.offsetXMm, 5);
    expect(slotPosition(3, grid).yMm).toBeCloseTo(grid.offsetYMm + grid.labelHeightMm, 5);
  });

  it('rolls onto the next page after the last slot', () => {
    expect(slotPosition(20, grid).page).toBe(0);
    expect(slotPosition(21, grid).page).toBe(1);
    expect(slotPosition(21, grid).xMm).toBeCloseTo(grid.offsetXMm, 5);
    expect(slotPosition(21, grid).yMm).toBeCloseTo(grid.offsetYMm, 5);
  });

  it('never places a label past the page edge', () => {
    for (let i = 0; i < grid.perPage; i += 1) {
      const { xMm, yMm } = slotPosition(i, grid);
      expect(xMm + grid.labelWidthMm).toBeLessThanOrEqual(grid.pageWidthMm + 1e-9);
      expect(yMm + grid.labelHeightMm).toBeLessThanOrEqual(grid.pageHeightMm + 1e-9);
    }
  });
});

describe('label internals', () => {
  it('gives the symbol more height when the human-readable line is off', () => {
    const withText = computeLabelBoxes('medium', {
      includeHumanReadable: true,
      hasContext: false,
      symbolType: 'barcode',
    });
    const withoutText = computeLabelBoxes('medium', {
      includeHumanReadable: false,
      hasContext: false,
      symbolType: 'barcode',
    });
    expect(withoutText.symbol.heightMm).toBeGreaterThan(withText.symbol.heightMm);
    expect(withText.codeBaselineMm).not.toBeNull();
    expect(withoutText.codeBaselineMm).toBeNull();
  });

  it('keeps a QR symbol square', () => {
    const boxes = computeLabelBoxes('large', {
      includeHumanReadable: true,
      hasContext: true,
      symbolType: 'qr',
    });
    expect(boxes.symbol.widthMm).toBeCloseTo(boxes.symbol.heightMm, 5);
  });

  it('lets a barcode use the full label width', () => {
    const boxes = computeLabelBoxes('small', {
      includeHumanReadable: true,
      hasContext: false,
      symbolType: 'barcode',
    });
    expect(boxes.symbol.widthMm).toBeGreaterThan(boxes.symbol.heightMm);
  });

  it('drops the context line on small stock rather than printing it illegibly', () => {
    const boxes = computeLabelBoxes('small', {
      includeHumanReadable: true,
      hasContext: true,
      symbolType: 'qr',
    });
    expect(boxes.contextBaselineMm).toBeNull();
  });

  it('keeps everything inside the label on every size and combination', () => {
    (['small', 'medium', 'large'] as LabelSize[]).forEach((size) => {
      [true, false].forEach((includeHumanReadable) => {
        [true, false].forEach((hasContext) => {
          (['qr', 'barcode'] as const).forEach((symbolType) => {
            const boxes = computeLabelBoxes(size, {
              includeHumanReadable,
              hasContext,
              symbolType,
            });
            const { width, height } = LABEL_DIMENSIONS_MM[size];
            expect(boxes.symbol.xMm).toBeGreaterThanOrEqual(0);
            expect(boxes.symbol.xMm + boxes.symbol.widthMm).toBeLessThanOrEqual(width + 1e-9);
            expect(boxes.symbol.heightMm).toBeGreaterThan(0);
            const lastBaseline = boxes.contextBaselineMm ?? boxes.codeBaselineMm ?? 0;
            expect(lastBaseline).toBeLessThanOrEqual(height + 1e-9);
          });
        });
      });
    });
  });
});
