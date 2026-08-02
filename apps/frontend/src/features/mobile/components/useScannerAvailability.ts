import { useEffect, useState } from 'react';
import {
  detectScannerBlocker,
  getBarcodeDetectorCtor,
  resolveScanFormats,
  SCANNER_BLOCKER_HINT,
  type ScanFormat,
  type ScannerBlocker,
} from './barcode-scanner-support';

export type ScannerAvailability =
  /** The async format probe has not answered yet — show nothing rather than a button that might vanish. */
  | { status: 'checking' }
  | { status: 'available'; formats: ScanFormat[] }
  | { status: 'unavailable'; blocker: ScannerBlocker; hint: string };

/**
 * Decides whether the camera button is offered at all.
 *
 * The synchronous checks run in the initial state so an unsupported browser
 * (iOS Safari, an http:// origin) never paints a camera button for a frame.
 * Only when those pass do we await the format probe, and that gap is a
 * microtask on a real device.
 */
export function useScannerAvailability(): ScannerAvailability {
  const [state, setState] = useState<ScannerAvailability>(() => {
    const blocker = detectScannerBlocker();
    return blocker
      ? { status: 'unavailable', blocker, hint: SCANNER_BLOCKER_HINT[blocker] }
      : { status: 'checking' };
  });

  useEffect(() => {
    if (state.status !== 'checking') return;
    let alive = true;
    void resolveScanFormats(getBarcodeDetectorCtor()).then((formats) => {
      if (!alive) return;
      setState(
        formats.length > 0
          ? { status: 'available', formats }
          : { status: 'unavailable', blocker: 'no-formats', hint: SCANNER_BLOCKER_HINT['no-formats'] }
      );
    });
    return () => {
      alive = false;
    };
  }, [state.status]);

  return state;
}
