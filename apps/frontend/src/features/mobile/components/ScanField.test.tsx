/**
 * ScanField is where the camera meets the input that warehouses already rely
 * on. Two things must hold on every device: the keyboard-wedge path (type,
 * then Enter) keeps working untouched, and the camera button is absent — not
 * broken — wherever the camera cannot be used.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ScanField } from './ScanField';

const ALL_FORMATS = ['qr_code', 'code_128', 'ean_13', 'code_39', 'ean_8'];

let detect: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let supportedFormats: () => Promise<string[]>;
let track: { stop: ReturnType<typeof vi.fn> };

class FakeBarcodeDetector {
  static getSupportedFormats() {
    return supportedFormats();
  }
  detect(source: unknown) {
    return detect(source);
  }
}

/** A device that can scan: secure origin, detector present, camera present. */
function supportedEnvironment() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'BarcodeDetector', {
    configurable: true,
    writable: true,
    value: FakeBarcodeDetector,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

function renderField(props: Partial<React.ComponentProps<typeof ScanField>> = {}) {
  const onValueChange = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <ScanField
      label="Scan bin barcode to confirm"
      cameraLabel="Scan bin with camera"
      value=""
      onValueChange={onValueChange}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { ...utils, onValueChange, onSubmit };
}

beforeEach(() => {
  supportedFormats = async () => [...ALL_FORMATS];
  detect = vi.fn().mockResolvedValue([]);
  track = { stop: vi.fn() };
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });

  Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();

  supportedEnvironment();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('manual and keyboard-wedge entry', () => {
  /** Let the async support probe land, so nothing re-renders mid-assertion. */
  const settled = () => screen.findByRole('button', { name: 'Scan bin with camera' });

  it('still reports every keystroke', async () => {
    const { onValueChange } = renderField();
    await settled();

    fireEvent.change(screen.getByLabelText(/scan bin barcode/i), { target: { value: 'A-01' } });
    expect(onValueChange).toHaveBeenCalledWith('A-01');
  });

  it('submits on Enter — a wedge scanner types the code then presses it', async () => {
    const { onSubmit } = renderField({ value: 'A-01-02' });
    await settled();

    fireEvent.keyDown(screen.getByLabelText(/scan bin barcode/i), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('A-01-02');
  });

  it('ignores other keys', async () => {
    const { onSubmit } = renderField({ value: 'A-01-02' });
    await settled();

    fireEvent.keyDown(screen.getByLabelText(/scan bin barcode/i), { key: 'a' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the input focused so the wedge has somewhere to type', async () => {
    renderField({ autoFocus: true });
    await settled();

    expect(screen.getByLabelText(/scan bin barcode/i)).toHaveFocus();
  });
});

describe('camera availability', () => {
  it('offers the camera button on a supported device', async () => {
    renderField();
    expect(await screen.findByRole('button', { name: 'Scan bin with camera' })).toBeInTheDocument();
  });

  it('hides the button and hints instead on a browser with no BarcodeDetector', async () => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    renderField();

    expect(await screen.findByText(/cannot scan with the camera/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan bin with camera' })).not.toBeInTheDocument();
    // The only path left must still be there and usable.
    expect(screen.getByLabelText(/scan bin barcode/i)).toBeInTheDocument();
  });

  it('hides the button on an insecure origin, where getUserMedia cannot run', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    renderField();

    expect(await screen.findByText(/secure \(https\) address/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan bin with camera' })).not.toBeInTheDocument();
  });

  it('hides the button when the device has no camera API', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderField();

    expect(await screen.findByText(/no camera available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan bin with camera' })).not.toBeInTheDocument();
  });

  it('can suppress the hint on the secondary field of a two-field screen', async () => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    renderField({ showUnavailableHint: false });

    await waitFor(() =>
      expect(screen.queryByText(/cannot scan with the camera/i)).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Scan bin with camera' })).not.toBeInTheDocument();
  });

  it('hides the button when the device reads none of the formats we print', async () => {
    supportedFormats = async () => ['pdf417'];
    renderField();

    expect(await screen.findByText(/cannot read warehouse barcodes/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan bin with camera' })).not.toBeInTheDocument();
  });
});

describe('scanning with the camera', () => {
  async function openScanner(props: Partial<React.ComponentProps<typeof ScanField>> = {}) {
    const rendered = renderField(props);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan bin with camera' }));
    return rendered;
  }

  it('fills the field with the decoded value, untouched', async () => {
    detect.mockResolvedValue([{ rawValue: 'a-01-02' }]);
    const { onValueChange } = await openScanner();

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('a-01-02'));
  });

  it('auto-submits when the field is told to (putaway bin confirmation)', async () => {
    detect.mockResolvedValue([{ rawValue: 'A-01-02' }]);
    const { onSubmit } = await openScanner({ submitOnScan: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('A-01-02'));
  });

  it('waits for the worker to confirm when it is not (pick quantity)', async () => {
    detect.mockResolvedValue([{ rawValue: 'SKU-1' }]);
    const { onValueChange, onSubmit } = await openScanner({ submitOnScan: false });

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('SKU-1'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes the viewfinder and releases the camera after a read', async () => {
    detect.mockResolvedValue([{ rawValue: 'A-01-02' }]);
    await openScanner();

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /scan bin barcode/i })).not.toBeInTheDocument()
    );
  });

  it('returns focus to the input on cancel so the wedge keeps working', async () => {
    await openScanner();

    fireEvent.click(await screen.findByRole('button', { name: /cancel and type instead/i }));

    await waitFor(() => expect(screen.getByLabelText(/scan bin barcode/i)).toHaveFocus());
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });
});
