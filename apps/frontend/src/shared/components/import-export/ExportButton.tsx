import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, ButtonProps } from '@/shared/components/ui/button';
import { ExportDialog } from './ExportDialog';
import { ImportExportConfig } from '@/shared/lib/import-export/types';

interface ExportButtonProps<T extends Record<string, unknown>> extends Omit<ButtonProps, 'onClick'> {
  config: ImportExportConfig<T>;
  data: T[];
  filters?: Record<string, unknown>;
  /** Export every record matching `filters` via `config.api.export`, not just `data`. */
  serverSide?: boolean;
  /** Total matching records, for the dialog copy when `serverSide` is on. */
  totalCount?: number;
}

export function ExportButton<T extends Record<string, unknown>>({
  config,
  data,
  filters,
  serverSide,
  totalCount,
  children,
  ...buttonProps
}: ExportButtonProps<T>) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setDialogOpen(true)}
        disabled={!data || data.length === 0}
        {...buttonProps}
      >
        <Download className="h-4 w-4 mr-2" />
        {children || 'Export'}
      </Button>

      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={config}
        data={data}
        filters={filters}
        serverSide={serverSide}
        totalCount={totalCount}
      />
    </>
  );
}
