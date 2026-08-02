/**
 * A camera cannot be exercised headlessly, so BarcodeDetector and
 * mediaDevices are faked here. What these tests are really guarding is the
 * lifecycle: the rear camera is the one requested, a read happens once, and —
 * above all — the MediaStreamTrack is stopped on every exit path. A leaked
 * track keeps the sensor powered and the privacy LED on, which flattens a
 * handheld over a shift and is exactly the sort of bug that ships silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { BarcodeScanner } from './BarcodeScanner';

const ALL_FORMATS = ['qr_code', 'code_128', 'ean_13', 'code_39', 'ean_8'];

let getUserMedia: ReturnType<typeof vi.fn>;
let detect: ReturnType<typeof vi.fn>;
let vibrate: ReturnType<typeof vi.fn>;
let supportedFormats: () => Promise<string[]>;
let detectorOptions: Array<{ formats?: string[] } | undefined>;
let track: { stop: ReturnType<typeof vi.fn>; kind: string };

class FakeBarcodeDetector {
  static getSupportedFormats() {
    return supportedFormats();
  }
  constructor(options?: { formats?: string[] }) {
    detectorOptions.push(options);
  }
  detect(source: unknown) {
    return detect(source);
  }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  fireEvent(document, new Event('visibilitychange'));
}

beforeEach(() => {
  detectorOptions = [];
  supportedFormats = async () => [...ALL_FORMATS];
  detect = vi.fn().mockResolvedValue([]);
  track = { stop: vi.fn(), kind: 'video' };
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  vibrate = vi.fn();

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
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

  // jsdom implements none of the media element behaviour the loop depends on.
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
});

afterEach(() => {
  // Reset the flag without dispatching, so the still-mounted component under
  // test does not try to re-open the camera during teardown.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  vi.restoreAllMocks();
});

describe('opening the camera', () => {
  it('asks for the rear camera, never the selfie one', async () => {
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } })
    );
  });

  it('only asks the detector for formats the device reports it can read', async () => {
    supportedFormats = async () => ['code_128', 'pdf417'];
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(detectorOptions).toHaveLength(1));
    expect(detectorOptions[0]).toEqual({ formats: ['code_128'] });
  });

  it('shows the title and a way out that does not need a successful scan', async () => {
    const onClose = vi.fn();
    render(<BarcodeScanner title="Scan bin barcode" hint="Destination A-01-02" onDetect={vi.fn()} onClose={onClose} />);

    expect(screen.getByText('Scan bin barcode')).toBeInTheDocument();
    expect(screen.getByText('Destination A-01-02')).toBeInTheDocument();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /cancel and type instead/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });
});

describe('a successful read', () => {
  it('hands back the decoded string verbatim', async () => {
    const onDetect = vi.fn();
    detect.mockResolvedValue([{ rawValue: 'a-01-02', format: 'code_128' }]);

    render(<BarcodeScanner title="Scan bin barcode" onDetect={onDetect} onClose={vi.fn()} />);

    await waitFor(() => expect(onDetect).toHaveBeenCalledWith('a-01-02'));
  });

  it('buzzes so a worker in ear defenders knows it landed', async () => {
    detect.mockResolvedValue([{ rawValue: 'A-01-02' }]);
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(vibrate).toHaveBeenCalledWith(100));
  });

  it('releases the camera immediately instead of leaving it running', async () => {
    detect.mockResolvedValue([{ rawValue: 'A-01-02' }]);
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(track.stop).toHaveBeenCalledTimes(1));
  });

  it('fires once, even though the decode loop keeps returning the same label', async () => {
    const onDetect = vi.fn();
    detect.mockResolvedValue([{ rawValue: 'A-01-02' }]);
    render(<BarcodeScanner title="Scan bin barcode" onDetect={onDetect} onClose={vi.fn()} />);

    await waitFor(() => expect(onDetect).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(onDetect).toHaveBeenCalledTimes(1);
  });
});

describe('releasing the camera', () => {
  it('stops the track on unmount', async () => {
    const { unmount } = render(
      <BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    unmount();

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });

  it('stops the track when the app goes into the background', async () => {
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    act(() => setVisibility('hidden'));

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(screen.getByText(/camera paused/i)).toBeInTheDocument();
  });

  it('re-opens the camera when the worker comes back to the app', async () => {
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    act(() => setVisibility('hidden'));
    await waitFor(() => expect(track.stop).toHaveBeenCalled());

    act(() => setVisibility('visible'));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });

  it('never opens a camera the worker has already cancelled out of', async () => {
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);
    // Cancelled in the same tick, before the async format probe has answered.
    fireEvent.click(screen.getByRole('button', { name: /cancel and type instead/i }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('stops a stream that arrives after the component is already gone', async () => {
    let resolveStream: (stream: unknown) => void = () => {};
    getUserMedia.mockImplementation(
      () => new Promise((resolve) => { resolveStream = resolve; })
    );

    const { unmount } = render(
      <BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();

    await act(async () => {
      resolveStream({ getTracks: () => [track] });
      await Promise.resolve();
    });

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
  });
});

describe('when the camera cannot be used', () => {
  async function renderWithError(name: string) {
    getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name }));
    const onClose = vi.fn();
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={onClose} />);
    await screen.findByText(/camera unavailable/i);
    return onClose;
  }

  it('explains a blocked permission without jargon and offers manual entry', async () => {
    const onClose = await renderWithError('NotAllowedError');

    expect(
      screen.getByText(
        'Camera access was blocked. Type the code instead, or enable camera access in your browser settings.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /type it instead/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles a device with no camera', async () => {
    await renderWithError('NotFoundError');
    expect(screen.getByText(/no camera was found/i)).toBeInTheDocument();
  });

  it('handles a camera another app is holding', async () => {
    await renderWithError('NotReadableError');
    expect(screen.getByText(/used by another app/i)).toBeInTheDocument();
  });

  it('never opens the camera when the device reads none of our formats', async () => {
    supportedFormats = async () => ['pdf417'];
    render(<BarcodeScanner title="Scan bin barcode" onDetect={vi.fn()} onClose={vi.fn()} />);

    await screen.findByText(/camera unavailable/i);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('lets the worker retry after fixing the permission', async () => {
    await renderWithError('NotAllowedError');
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.queryByText(/camera unavailable/i)).not.toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
