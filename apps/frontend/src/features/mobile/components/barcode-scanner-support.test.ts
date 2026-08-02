/**
 * The degradation paths are the point of this module: a warehouse floor has
 * iPhones, http:// kiosk URLs and revoked camera permissions on it, and none of
 * those may ever leave a worker looking at a dead screen. None of them can be
 * reproduced in CI either, so they are pinned here as pure functions.
 */
import { describe, it, expect } from 'vitest';
import {
  SCAN_FORMATS,
  SCANNER_BLOCKER_HINT,
  CAMERA_FAILURE_MESSAGE,
  classifyCameraError,
  describeCameraError,
  detectScannerBlocker,
  firstDecodedValue,
  negotiateFormats,
  resolveScanFormats,
  type BarcodeDetectorCtor,
  type ScannerGlobals,
} from './barcode-scanner-support';

function globals(overrides: Partial<ScannerGlobals> = {}): ScannerGlobals {
  return {
    isSecureContext: true,
    BarcodeDetector: function BarcodeDetector() {} as unknown,
    navigator: { mediaDevices: { getUserMedia: () => {} } },
    ...overrides,
  };
}

describe('detectScannerBlocker', () => {
  it('offers the camera on a secure origin with a detector and a camera API', () => {
    expect(detectScannerBlocker(globals())).toBeNull();
  });

  it('blocks on an insecure origin — getUserMedia is unavailable outside https', () => {
    expect(detectScannerBlocker(globals({ isSecureContext: false }))).toBe('insecure-context');
  });

  it('reports the insecure origin first, since it breaks the camera regardless of anything else', () => {
    expect(
      detectScannerBlocker(globals({ isSecureContext: false, BarcodeDetector: undefined }))
    ).toBe('insecure-context');
  });

  it('blocks when the browser has no BarcodeDetector (iOS Safari)', () => {
    expect(detectScannerBlocker(globals({ BarcodeDetector: undefined }))).toBe('no-detector');
  });

  it('blocks when BarcodeDetector is present but not constructible', () => {
    expect(detectScannerBlocker(globals({ BarcodeDetector: {} }))).toBe('no-detector');
  });

  it('blocks when the device exposes no mediaDevices at all', () => {
    expect(detectScannerBlocker(globals({ navigator: {} }))).toBe('no-camera-api');
  });

  it('blocks when mediaDevices exists without getUserMedia', () => {
    expect(detectScannerBlocker(globals({ navigator: { mediaDevices: {} } }))).toBe('no-camera-api');
  });

  it('gives every blocker a hint that tells the worker to type instead', () => {
    for (const hint of Object.values(SCANNER_BLOCKER_HINT)) {
      expect(hint).toMatch(/type the code/i);
    }
  });
});

describe('negotiateFormats', () => {
  it('keeps only the formats the device actually supports', () => {
    expect(negotiateFormats(['code_128', 'pdf417', 'qr_code'])).toEqual(['qr_code', 'code_128']);
  });

  it('is case-insensitive about what the platform reports', () => {
    expect(negotiateFormats(['CODE_128'])).toEqual(['code_128']);
  });

  it('returns nothing when the device reads only formats we never print', () => {
    expect(negotiateFormats(['pdf417', 'aztec'])).toEqual([]);
  });

  it('includes the label-printer format code_128 in the requested set', () => {
    expect(SCAN_FORMATS).toContain('code_128');
  });
});

describe('resolveScanFormats', () => {
  it('returns nothing when there is no detector to ask', async () => {
    await expect(resolveScanFormats(undefined)).resolves.toEqual([]);
  });

  it('intersects with the platform format list', async () => {
    const ctor = function () {} as unknown as BarcodeDetectorCtor;
    ctor.getSupportedFormats = async () => ['code_128', 'pdf417'];
    await expect(resolveScanFormats(ctor)).resolves.toEqual(['code_128']);
  });

  it('optimistically asks for everything when the probe is missing', async () => {
    const ctor = function () {} as unknown as BarcodeDetectorCtor;
    await expect(resolveScanFormats(ctor)).resolves.toEqual([...SCAN_FORMATS]);
  });

  it('treats a throwing probe as unsupported rather than rejecting', async () => {
    const ctor = function () {} as unknown as BarcodeDetectorCtor;
    ctor.getSupportedFormats = async () => {
      throw new Error('Play Services module missing');
    };
    await expect(resolveScanFormats(ctor)).resolves.toEqual([]);
  });
});

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['PermissionDeniedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-camera'],
    ['DevicesNotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'camera-busy'],
    ['TrackStartError', 'camera-busy'],
    ['AbortError', 'camera-busy'],
  ] as const)('maps %s to %s', (name, expected) => {
    expect(classifyCameraError(Object.assign(new Error('x'), { name }))).toBe(expected);
  });

  it('falls back to unknown for anything unrecognised, including null', () => {
    expect(classifyCameraError(null)).toBe('unknown');
    expect(classifyCameraError(new Error('boom'))).toBe('unknown');
  });

  it('describes a blocked permission in words a worker can act on', () => {
    expect(describeCameraError(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe(
      'Camera access was blocked. Type the code instead, or enable camera access in your browser settings.'
    );
  });

  it('never surfaces a failure without pointing back at manual entry', () => {
    for (const message of Object.values(CAMERA_FAILURE_MESSAGE)) {
      expect(message).toMatch(/type the code/i);
    }
  });
});

describe('firstDecodedValue', () => {
  it('returns the payload exactly as encoded — no trim, no case change', () => {
    expect(firstDecodedValue([{ rawValue: ' a-01-02 ' }])).toBe(' a-01-02 ');
    expect(firstDecodedValue([{ rawValue: 'sku-abc' }])).toBe('sku-abc');
  });

  it('skips empty results and picks the first real payload', () => {
    expect(firstDecodedValue([{ rawValue: '' }, {}, { rawValue: 'A-01-02' }])).toBe('A-01-02');
  });

  it('returns null when the frame decoded nothing', () => {
    expect(firstDecodedValue([])).toBeNull();
    expect(firstDecodedValue(undefined)).toBeNull();
  });
});
