/**
 * Feature detection and error mapping for camera scanning.
 *
 * Deliberately dependency-free and DOM-light: everything here is a pure
 * function over an injected `window`/error, so the degradation paths (iOS
 * Safari, http origins, blocked permission, no camera) are unit-testable
 * without a browser — which is the only way they ever get tested, because a
 * headless CI has no camera to deny.
 *
 * The scanner is built on the native `BarcodeDetector` API on purpose. Chrome
 * on Android — what warehouse handhelds overwhelmingly run — ships it, and it
 * costs zero bytes. A JS decoding library (html5-qrcode, zxing, quagga) would
 * add hundreds of KiB to the boot payload that was just cut to ~755 KiB so
 * workers get a fast PWA install, and vite.config's boot-graph guard exists to
 * stop exactly that regression.
 */

/**
 * Formats a Veerha label can actually carry. `code_128` is what the label
 * printer emits for bins and SKUs; the retail EAN/UPC formats are here because
 * supplier cartons arrive with them already printed, and `qr_code` because the
 * pallet labels use it.
 */
export const SCAN_FORMATS = ['qr_code', 'code_128', 'ean_13', 'code_39', 'ean_8'] as const;

export type ScanFormat = (typeof SCAN_FORMATS)[number];

/** A decoded symbol, as returned by `BarcodeDetector.detect()`. */
export interface DetectedBarcode {
  rawValue?: string;
  format?: string;
}

export interface BarcodeDetectorLike {
  detect(source: unknown): Promise<DetectedBarcode[]>;
}

export interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/**
 * Why camera scanning is not on offer. `null` means it is.
 *
 * Each value maps to a hint the worker can act on — never a stack trace, and
 * never a camera button that does nothing when tapped.
 */
export type ScannerBlocker =
  | 'insecure-context'
  | 'no-camera-api'
  | 'no-detector'
  | 'no-formats';

export const SCANNER_BLOCKER_HINT: Record<ScannerBlocker, string> = {
  // getUserMedia is unavailable outside a secure context (localhost excepted),
  // so an http:// warehouse LAN address can never scan.
  'insecure-context': 'Camera scanning needs a secure (https) address — type the code instead.',
  'no-camera-api': 'This device has no camera available — type the code instead.',
  // Notably iOS Safari, which has no BarcodeDetector at any version.
  'no-detector': 'This browser cannot scan with the camera — type the code, or use Chrome on Android.',
  'no-formats': 'This device cannot read warehouse barcodes with the camera — type the code instead.',
};

/**
 * Everything `detectScannerBlocker` reads off the global. Typed loosely so a
 * test can hand in a bare object instead of standing up a fake Window.
 */
export interface ScannerGlobals {
  isSecureContext?: boolean;
  BarcodeDetector?: unknown;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
}

/**
 * Synchronous half of the support check — cheap enough to run during render,
 * so the camera button is never painted on a browser that cannot honour it.
 *
 * Order matters: an insecure origin breaks getUserMedia no matter what else is
 * present, so it is reported first and gets the most actionable hint.
 */
export function detectScannerBlocker(globals?: ScannerGlobals): ScannerBlocker | null {
  const win = globals ?? (typeof window === 'undefined' ? undefined : (window as unknown as ScannerGlobals));
  if (!win) return 'no-camera-api';

  if (win.isSecureContext === false) return 'insecure-context';

  const mediaDevices = win.navigator?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return 'no-camera-api';

  if (typeof win.BarcodeDetector !== 'function') return 'no-detector';

  return null;
}

/** Grab the constructor without leaking an `any` into every call site. */
export function getBarcodeDetectorCtor(): BarcodeDetectorCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const ctor = (window as unknown as ScannerGlobals).BarcodeDetector;
  return typeof ctor === 'function' ? (ctor as BarcodeDetectorCtor) : undefined;
}

/**
 * Intersect what we want with what the device can do, keeping our order so the
 * most likely warehouse format is asked for first.
 */
export function negotiateFormats(supported: readonly string[]): ScanFormat[] {
  const available = new Set(supported.map((f) => String(f).toLowerCase()));
  return SCAN_FORMATS.filter((format) => available.has(format));
}

/**
 * Async half of the support check. Android exposes BarcodeDetector but the
 * backing Play Services module can report a format list that does not overlap
 * ours; constructing a detector with a format it does not know throws, so ask
 * first. Never rejects — an empty array means "do not offer the camera".
 */
export async function resolveScanFormats(ctor?: BarcodeDetectorCtor): Promise<ScanFormat[]> {
  if (typeof ctor !== 'function') return [];
  if (typeof ctor.getSupportedFormats !== 'function') {
    // Old implementations without the static probe: optimistically ask for the
    // full set and let the constructor complain at open time.
    return [...SCAN_FORMATS];
  }
  try {
    const supported = await ctor.getSupportedFormats();
    return negotiateFormats(Array.isArray(supported) ? supported : []);
  } catch {
    return [];
  }
}

/** Why the camera failed once we actually tried to open it. */
export type CameraFailure = 'permission-denied' | 'no-camera' | 'camera-busy' | 'unknown';

export const CAMERA_FAILURE_MESSAGE: Record<CameraFailure, string> = {
  'permission-denied':
    'Camera access was blocked. Type the code instead, or enable camera access in your browser settings.',
  'no-camera': 'No camera was found on this device. Type the code instead.',
  'camera-busy': 'The camera is being used by another app. Close it and try again, or type the code instead.',
  unknown: 'The camera could not be started. Type the code instead.',
};

/**
 * Map a getUserMedia rejection onto something a warehouse worker can act on.
 * The names come from the Media Capture spec plus the legacy aliases Chrome
 * and Firefox still throw.
 */
export function classifyCameraError(error: unknown): CameraFailure {
  const name = (error as { name?: string } | null | undefined)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no-camera';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'camera-busy';
    default:
      return 'unknown';
  }
}

export function describeCameraError(error: unknown): string {
  return CAMERA_FAILURE_MESSAGE[classifyCameraError(error)];
}

/**
 * Pick the payload out of a detection result.
 *
 * Returns the decoded string **verbatim** — no trimming, no uppercasing, no
 * prefix stripping. A location label encodes the bin `code` (`A-01-02`) and a
 * SKU label encodes the SKU barcode or, failing that, its code; the backend
 * owns the matching (and compares bins case-insensitively). Any cleverness
 * here would silently diverge from what the label printer produced.
 */
export function firstDecodedValue(codes: DetectedBarcode[] | null | undefined): string | null {
  if (!Array.isArray(codes)) return null;
  for (const code of codes) {
    if (typeof code?.rawValue === 'string' && code.rawValue.length > 0) return code.rawValue;
  }
  return null;
}
