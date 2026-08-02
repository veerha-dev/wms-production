import { Suspense, lazy, useState } from 'react';
import { QrCode } from 'lucide-react';

import { Button, type ButtonProps } from '@/shared/components/ui/button';

import type { LabelPrintDialogProps } from './LabelPrintDialog';

/**
 * The whole label feature hangs off this one dynamic import.
 *
 * qrcode, jsbarcode and jspdf together are the bulk of what the PWA precache
 * was trimmed of, and vite.config.ts fails the build if any of them becomes
 * statically reachable from the entry chunk. Printing labels is a desktop admin
 * action a warehouse picker on a phone will never take, so nothing here is
 * loaded until someone actually clicks the button — and the type-only import
 * above is erased at compile time, so it does not create an edge in the graph.
 */
const LabelPrintDialog = lazy(() => import('./LabelPrintDialog'));

type LabelPrintButtonProps = Omit<LabelPrintDialogProps, 'open' | 'onOpenChange'> & {
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  className?: string;
};

export function LabelPrintButton({
  label = 'Print Labels',
  variant = 'outline',
  size,
  disabled,
  className,
  ...dialogProps
}: LabelPrintButtonProps) {
  const [open, setOpen] = useState(false);
  // Separate from `open` so the dialog's chunk (and the symbol libraries it
  // pulls in) stays in memory across a close/reopen instead of being fetched,
  // parsed and torn down each time.
  const [everOpened, setEverOpened] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        className={className ? `gap-2 ${className}` : 'gap-2'}
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
      >
        <QrCode className="h-4 w-4" />
        {label}
      </Button>

      {everOpened && (
        <Suspense fallback={null}>
          <LabelPrintDialog open={open} onOpenChange={setOpen} {...dialogProps} />
        </Suspense>
      )}
    </>
  );
}

export default LabelPrintButton;
