import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { LABEL_DIMENSIONS_MM } from '../constants';
import { computeLabelBoxes, ptToMm } from '../lib/layout';
import { selectBarcodeFormatFor } from '../lib/encoding';
import { renderSymbol } from '../lib/symbols';
import type { LabelItem, LabelKind, PrintRunOptions } from '../types';

interface LabelPreviewProps {
  item: LabelItem | null;
  kind: LabelKind;
  options: PrintRunOptions;
  /** On-screen width of the preview, in CSS pixels. */
  displayWidthPx?: number;
}

/**
 * One label, drawn to scale, before anyone commits a sheet to the printer.
 *
 * The geometry comes from the same `computeLabelBoxes` the PDF uses, converted
 * mm → CSS px by a single scale factor, so what is on screen is what comes out
 * of the printer rather than a hand-tuned approximation of it. 96 DPI is plenty
 * for the symbol here — this bitmap is never printed.
 */
export function LabelPreview({ item, kind, options, displayWidthPx = 260 }: LabelPreviewProps) {
  const [symbolUrl, setSymbolUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { width: labelWidthMm, height: labelHeightMm } = LABEL_DIMENSIONS_MM[options.labelSize];
  const scale = displayWidthPx / labelWidthMm;

  const boxes = computeLabelBoxes(options.labelSize, {
    includeHumanReadable: options.includeHumanReadable,
    hasContext: Boolean(item?.context),
    symbolType: options.symbolType,
  });

  const value = item?.value ?? '';

  useEffect(() => {
    if (!value) {
      setSymbolUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    renderSymbol({
      value,
      symbolType: options.symbolType,
      format: selectBarcodeFormatFor(kind, value),
      widthMm: boxes.symbol.widthMm,
      heightMm: boxes.symbol.heightMm,
      dpi: 150,
    })
      .then((symbol) => {
        if (!cancelled) setSymbolUrl(symbol.dataUrl);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render this symbol');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [value, options.symbolType, kind, boxes.symbol.widthMm, boxes.symbol.heightMm]);

  if (!item) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Nothing selected to preview
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden border border-border bg-white shadow-sm"
        style={{ width: displayWidthPx, height: labelHeightMm * scale }}
        data-testid="label-preview"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center gap-1 px-2 text-center text-[10px] text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {error}
          </div>
        )}

        {symbolUrl && !error && (
          <img
            src={symbolUrl}
            alt=""
            style={{
              position: 'absolute',
              left: boxes.symbol.xMm * scale,
              top: boxes.symbol.yMm * scale,
              width: boxes.symbol.widthMm * scale,
              height: boxes.symbol.heightMm * scale,
            }}
          />
        )}

        {boxes.codeBaselineMm !== null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              // The PDF positions text by baseline; the browser by box top.
              top: (boxes.codeBaselineMm - ptToMm(boxes.codePt)) * scale,
              textAlign: 'center',
              fontSize: ptToMm(boxes.codePt) * scale,
              fontWeight: 700,
              lineHeight: 1.1,
              color: '#000',
              fontFamily: 'Helvetica, Arial, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {item.caption}
          </div>
        )}

        {boxes.contextBaselineMm !== null && item.context && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (boxes.contextBaselineMm - ptToMm(boxes.contextPt)) * scale,
              textAlign: 'center',
              fontSize: ptToMm(boxes.contextPt) * scale,
              lineHeight: 1.1,
              color: '#464646',
              fontFamily: 'Helvetica, Arial, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.context}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {labelWidthMm} × {labelHeightMm} mm — actual size
      </p>
    </div>
  );
}

export default LabelPreview;
