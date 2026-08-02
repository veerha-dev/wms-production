import { useCallback, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { BarcodeScanner } from './BarcodeScanner';
import { useScannerAvailability } from './useScannerAvailability';

interface ScanFieldProps {
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Fired by an Enter keypress (a keyboard-wedge scanner ends every scan with
   * one) and, when `submitOnScan` is set, by a successful camera read.
   */
  onSubmit?: (value: string) => void;
  /**
   * Submit straight from a camera read instead of waiting for a tap. Only for
   * fields where the posted value is the *whole* decision — see the call sites.
   */
  submitOnScan?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Accessible name for the camera button; distinguish it when a screen has two. */
  cameraLabel?: string;
  /** Second line inside the viewfinder, e.g. the bin the worker is looking for. */
  scannerHint?: string;
  /** Lets a parent move focus here (bin scan → SKU field on the pick screen). */
  inputRef?: RefObject<HTMLInputElement>;
  /**
   * Explain *why* there is no camera button. Turn off on the secondary field of
   * a screen with two, so the same sentence is not printed twice.
   */
  showUnavailableHint?: boolean;
}

/**
 * A scan target: the text input that has always been here, plus a camera
 * button beside it.
 *
 * The input is the primary path and stays exactly as capable as before — a
 * keyboard-wedge scanner types into it and ends with Enter, and a worker can
 * still type a code by hand. The camera is strictly additive, and it is hidden
 * outright on any device that cannot honour it, because a button that does
 * nothing is worse than no button.
 */
export function ScanField({
  label,
  value,
  onValueChange,
  onSubmit,
  submitOnScan = false,
  placeholder,
  autoFocus,
  cameraLabel = 'Scan with camera',
  scannerHint,
  inputRef,
  showUnavailableHint = true,
}: ScanFieldProps) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? fallbackRef;
  const id = useId();
  const availability = useScannerAvailability();
  const [scanning, setScanning] = useState(false);

  const closeScanner = useCallback(() => {
    setScanning(false);
    // Hand focus back so the hardware scanner keeps working immediately after
    // the worker cancels out of the camera.
    ref.current?.focus();
  }, [ref]);

  const handleDetect = useCallback(
    (rawValue: string) => {
      setScanning(false);
      // Verbatim: the backend owns barcode matching.
      onValueChange(rawValue);
      ref.current?.focus();
      if (submitOnScan) onSubmit?.(rawValue);
    },
    [onSubmit, onValueChange, ref, submitOnScan]
  );

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1 text-sm font-medium">
        <ScanLine className="h-4 w-4" /> {label}
      </label>

      <div className="flex gap-2">
        <Input
          id={id}
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onSubmit?.(e.currentTarget.value);
          }}
          placeholder={placeholder}
          // Codes are not prose: a phone keyboard that capitalises or
          // autocorrects them turns a good scan into a failed lookup.
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          className="h-12 flex-1 text-lg"
        />

        {availability.status === 'available' && (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0 p-0"
            aria-label={cameraLabel}
            onClick={() => setScanning(true)}
          >
            <Camera className="h-5 w-5" />
          </Button>
        )}
      </div>

      {availability.status === 'unavailable' && showUnavailableHint && (
        <p className="text-xs text-muted-foreground">{availability.hint}</p>
      )}

      {scanning && (
        <BarcodeScanner
          title={typeof label === 'string' ? label : cameraLabel}
          hint={scannerHint}
          onDetect={handleDetect}
          onClose={closeScanner}
        />
      )}
    </div>
  );
}

export default ScanField;
