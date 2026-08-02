import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraOff, Keyboard, RotateCcw, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  describeCameraError,
  firstDecodedValue,
  getBarcodeDetectorCtor,
  resolveScanFormats,
  type BarcodeDetectorLike,
} from './barcode-scanner-support';

interface BarcodeScannerProps {
  /** Shown at the top of the viewfinder, e.g. "Scan bin barcode". */
  title: string;
  /** Optional second line, e.g. the bin the worker is looking for. */
  hint?: string;
  /** Called once, with the decoded string exactly as the label encodes it. */
  onDetect: (rawValue: string) => void;
  /** Cancel, or "type it instead" from the failure panel. */
  onClose: () => void;
}

/**
 * Full-screen camera viewfinder backed by the native `BarcodeDetector` API.
 *
 * Mounting it opens the camera; unmounting releases it. The parent decides
 * when it exists, which keeps the lifecycle to one rule and makes the
 * battery-drain failure mode (a stream left running after the worker moves on)
 * hard to reintroduce.
 *
 * Everything about the layout assumes a phone held one-handed by someone
 * wearing gloves: full-bleed preview, a single large target, and controls that
 * are at least 56px tall along the bottom edge where a thumb reaches.
 */
export function BarcodeScanner({ title, hint, onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  /**
   * Bumped by every `releaseCamera()`. Each async step of `start()` compares
   * the token it captured against this before touching state or holding onto a
   * stream, so a camera that arrives after an unmount (or after a second
   * start) is stopped instead of leaked.
   */
  const runRef = useRef(0);
  /** A code has been read — the loop must never fire onDetect twice. */
  const settledRef = useRef(false);
  const pausedRef = useRef(false);
  const failureRef = useRef<string | null>(null);
  const onDetectRef = useRef(onDetect);

  const [phase, setPhase] = useState<'starting' | 'scanning' | 'paused'>('starting');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  /**
   * Stop the decode loop and hand the camera back to the OS.
   *
   * A stream left open keeps the sensor powered and the privacy LED lit, which
   * flattens a handheld over a shift and generates support tickets. Called on
   * success, cancel, unmount and tab-hide.
   */
  const releaseCamera = useCallback(() => {
    runRef.current += 1;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* a track already ended by the OS throws; nothing to do about it */
      }
    });

    const video = videoRef.current;
    if (video) {
      try {
        video.pause?.();
      } catch {
        /* jsdom and some mobile browsers refuse pause on an ended stream */
      }
      video.srcObject = null;
    }
  }, []);

  const runDetectLoop = useCallback(
    (detector: BarcodeDetectorLike, run: number) => {
      const tick = async () => {
        if (run !== runRef.current || settledRef.current) return;

        const video = videoRef.current;
        // readyState < HAVE_CURRENT_DATA means there is no frame to decode yet.
        if (video && video.readyState >= 2) {
          try {
            const value = firstDecodedValue(await detector.detect(video));
            if (value) {
              if (run !== runRef.current || settledRef.current) return;
              settledRef.current = true;
              try {
                // A worker in ear defenders will never hear a beep, but they
                // feel this through a glove.
                navigator.vibrate?.(100);
              } catch {
                /* vibrate throws on some desktop browsers behind a user-gesture policy */
              }
              releaseCamera();
              onDetectRef.current(value);
              return;
            }
          } catch {
            /* a frame that fails to decode is the normal case, not an error */
          }
        }

        if (run !== runRef.current || settledRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };

      void tick();
    },
    [releaseCamera]
  );

  const start = useCallback(async () => {
    // Never stack two streams: this also invalidates any in-flight start.
    releaseCamera();
    const run = runRef.current;

    failureRef.current = null;
    setFailure(null);
    setPhase('starting');

    try {
      const ctor = getBarcodeDetectorCtor();
      const formats = await resolveScanFormats(ctor);
      if (run !== runRef.current) return;
      if (!ctor || formats.length === 0) {
        throw new DOMException('No usable barcode formats', 'NotSupportedError');
      }

      // `environment` is the rear camera. Defaulting to the selfie camera is a
      // classic bug that makes the whole feature look broken.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      if (run !== runRef.current) {
        stream.getTracks?.().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play?.();
        } catch {
          /* an autoplay refusal still leaves decodable frames on the element */
        }
      }
      if (run !== runRef.current) return;

      const detector = new ctor({ formats });
      setPhase('scanning');
      runDetectLoop(detector, run);
    } catch (error) {
      if (run !== runRef.current) return;
      releaseCamera();
      const message = describeCameraError(error);
      failureRef.current = message;
      setFailure(message);
    }
  }, [releaseCamera, runDetectLoop]);

  useEffect(() => {
    void start();
    return () => {
      releaseCamera();
    };
  }, [start, releaseCamera]);

  /**
   * Backgrounding the app must drop the camera immediately — a worker who
   * switches to the radio app should not leave the sensor running. Coming back
   * re-opens it, because permission has already been granted, so they land on
   * a live viewfinder rather than a frozen black rectangle.
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (settledRef.current || failureRef.current) return;
        releaseCamera();
        pausedRef.current = true;
        setPhase('paused');
      } else if (pausedRef.current && !settledRef.current) {
        pausedRef.current = false;
        void start();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [start, releaseCamera]);

  const close = useCallback(() => {
    releaseCamera();
    onClose();
  }, [releaseCamera, onClose]);

  if (failure) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/90 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl bg-background p-5">
          <div className="flex items-center gap-2 text-base font-semibold">
            <CameraOff className="h-5 w-5 text-destructive" /> Camera unavailable
          </div>
          <p className="text-sm text-muted-foreground">{failure}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-14 flex-1 text-base" onClick={() => void start()}>
              <RotateCcw className="mr-1 h-5 w-5" /> Try again
            </Button>
            <Button className="h-14 flex-1 text-base" onClick={close}>
              <Keyboard className="mr-1 h-5 w-5" /> Type it instead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />

      {/* Everything below sits on top of the preview. */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="text-white">
            <div className="text-base font-semibold">{title}</div>
            {hint && <div className="text-sm text-white/70">{hint}</div>}
          </div>
          <Button
            variant="ghost"
            className="h-12 w-12 shrink-0 rounded-full p-0 text-white hover:bg-white/20 hover:text-white"
            aria-label="Close scanner"
            onClick={close}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          {/* Aiming target. Deliberately large — a gloved worker cannot hold a
              phone steady over a 2cm box at arm's length. */}
          <div className="relative aspect-[4/3] w-full max-w-sm">
            <div className="absolute inset-0 rounded-2xl border-2 border-white/40" />
            <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
            <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
            <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
            <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-2xl border-b-4 border-r-4 border-primary" />
            <div className="absolute left-4 right-4 top-1/2 h-0.5 animate-pulse bg-primary/80" />
          </div>
        </div>

        <div className="space-y-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-6">
          <p className="text-center text-sm text-white/80" role="status">
            {phase === 'paused'
              ? 'Camera paused while the app is in the background.'
              : phase === 'starting'
                ? 'Starting camera…'
                : 'Hold the label inside the frame.'}
          </p>
          <Button
            variant="secondary"
            className="h-16 w-full text-base font-semibold"
            onClick={close}
          >
            <Keyboard className="mr-2 h-5 w-5" /> Cancel and type instead
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BarcodeScanner;
