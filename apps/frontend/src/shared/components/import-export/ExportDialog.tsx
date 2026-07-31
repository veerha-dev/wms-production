import { useState, useCallback } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { ExportProgressTracker } from './ProgressTracker';
import { ImportExportConfig, ExportProgress, FileFormat } from '@/shared/lib/import-export/types';
import { exportToCSV } from '@/shared/lib/import-export/csv-generator';
import { exportToExcel } from '@/shared/lib/import-export/excel-generator';
import { api } from '@/shared/lib/api';

interface ExportDialogProps<T extends Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ImportExportConfig<T>;
  data: T[];
  filters?: Record<string, unknown>;
  /**
   * Opt in to server-side export: fetch EVERY record matching `filters` from
   * `config.api.export` at export time instead of writing out the page of rows
   * held in `data`. Off by default so screens whose export endpoint does not
   * exist yet keep the client-side behaviour.
   */
  serverSide?: boolean;
  /** Total matching records, used for the button/description copy. */
  totalCount?: number;
}

export function ExportDialog<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  config,
  data,
  filters,
  serverSide = false,
  totalCount,
}: ExportDialogProps<T>) {
  const [format, setFormat] = useState<FileFormat>('csv');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(config.export.defaultColumns);
  const [progress, setProgress] = useState<ExportProgress>({
    stage: 'idle',
    progress: 0,
    message: '',
  });

  const handleColumnToggle = useCallback((columnKey: string, checked: boolean) => {
    setSelectedColumns((prev) =>
      checked ? [...prev, columnKey] : prev.filter((c) => c !== columnKey)
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedColumns(config.export.columns.map((c) => c.key));
  }, [config.export.columns]);

  const handleSelectNone = useCallback(() => {
    setSelectedColumns([]);
  }, []);

  const handleExport = useCallback(async () => {
    if (selectedColumns.length === 0) return;

    const useServer = serverSide && !!config.api.export;
    setProgress({
      stage: 'generating',
      progress: useServer ? 25 : 50,
      message: useServer ? 'Fetching all records...' : 'Generating file...',
    });

    try {
      // Pull the full result set — the loaded page is only the current 25 rows.
      let rows: T[] = data;
      if (useServer) {
        const { data: body } = await api.get(config.api.export as string, { params: filters });
        const fetched = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null;
        if (!fetched) throw new Error('Export endpoint returned an unexpected response');
        rows = fetched as T[];
        setProgress({ stage: 'generating', progress: 65, message: 'Generating file...' });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (format === 'csv') {
        exportToCSV(rows, {
          config: config.export,
          selectedColumns,
          filters,
        });
      } else {
        exportToExcel(rows, {
          config: config.export,
          selectedColumns,
          filters,
        });
      }

      setProgress({
        stage: 'complete',
        progress: 100,
        message: `Export complete — ${rows.length} records`,
      });

      setTimeout(() => {
        onOpenChange(false);
        setProgress({ stage: 'idle', progress: 0, message: '' });
      }, 1500);
    } catch (error) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Export failed',
      });
    }
  }, [format, selectedColumns, data, config.export, config.api.export, serverSide, filters, onOpenChange]);

  // Server-side export writes every matching record, not just the loaded page.
  const recordCount = serverSide && config.api.export ? totalCount ?? data.length : data.length;

  const handleClose = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    onOpenChange(false);
  }, [onOpenChange]);

  const isExporting = progress.stage !== 'idle' && progress.stage !== 'error';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export {config.entityLabel}</DialogTitle>
          <DialogDescription>
            Export {recordCount} {config.entityLabel.toLowerCase()} records to a file.
          </DialogDescription>
        </DialogHeader>

        {progress.stage === 'idle' || progress.stage === 'error' ? (
          <div className="py-4 space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">File Format</Label>
              <RadioGroup
                value={format}
                onValueChange={(value) => setFormat(value as FileFormat)}
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="csv"
                    id="format-csv"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="format-csv"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <FileText className="mb-2 h-6 w-6" />
                    <span className="text-sm font-medium">CSV</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="xlsx"
                    id="format-xlsx"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="format-xlsx"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <FileSpreadsheet className="mb-2 h-6 w-6" />
                    <span className="text-sm font-medium">Excel</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Columns to Export</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSelectNone}>
                    None
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[200px] border rounded-md p-3">
                <div className="space-y-2">
                  {config.export.columns.map((column) => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`col-${column.key}`}
                        checked={selectedColumns.includes(column.key)}
                        onCheckedChange={(checked) =>
                          handleColumnToggle(column.key, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={`col-${column.key}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <p className="text-xs text-muted-foreground">
                {selectedColumns.length} of {config.export.columns.length} columns selected
              </p>
            </div>

            {progress.stage === 'error' && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {progress.message}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4">
            <ExportProgressTracker progress={progress} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedColumns.length === 0 || isExporting}
          >
            Export {recordCount} Records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
