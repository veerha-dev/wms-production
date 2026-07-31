import { useState, useCallback } from 'react';
import { Download, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { FileUploadZone } from './FileUploadZone';
import { ColumnMappingTable } from './ColumnMappingTable';
import { ValidationResults } from './ValidationResults';
import { ImportProgressTracker } from './ProgressTracker';
import {
  ImportExportConfig,
  ParseResult,
  ColumnMapping,
  ImportProgress,
  BulkImportResult,
} from '@/shared/lib/import-export/types';
import { parseCSV, autoMapColumns, transformRows } from '@/shared/lib/import-export/csv-parser';
import { parseExcel } from '@/shared/lib/import-export/excel-parser';
import { downloadTemplateCSV } from '@/shared/lib/import-export/csv-generator';
import { api } from '@/shared/lib/api';

type ImportStep = 'upload' | 'mapping' | 'validation' | 'importing' | 'complete';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ImportExportConfig;
  onImportComplete?: (result: BulkImportResult) => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  config,
  onImportComplete,
}: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [progress, setProgress] = useState<ImportProgress>({
    stage: 'idle',
    progress: 0,
    message: '',
  });

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setColumnMappings([]);
    setProgress({ stage: 'idle', progress: 0, message: '' });
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setProgress({ stage: 'parsing', progress: 30, message: 'Parsing file...' });

      try {
        const isExcel = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
        const result = isExcel
          ? await parseExcel(selectedFile, { config: config.import })
          : await parseCSV(selectedFile, { config: config.import });

        const mappings = autoMapColumns(result.headers, config.import);
        setColumnMappings(mappings);
        setParseResult(result);
        setProgress({ stage: 'idle', progress: 0, message: '' });
        setStep('mapping');
      } catch (error) {
        setProgress({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Failed to parse file',
        });
      }
    },
    [config.import]
  );

  const handleMappingChange = useCallback(
    (targetField: string, sourceColumn: string) => {
      setColumnMappings((prev) =>
        prev.map((m) =>
          m.targetField === targetField
            ? { ...m, sourceColumn, isMatched: !!sourceColumn }
            : m
        )
      );
    },
    []
  );

  const handleRevalidate = useCallback(async () => {
    if (!file) return;

    setProgress({ stage: 'validating', progress: 50, message: 'Validating data...' });

    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const result = isExcel
        ? await parseExcel(file, { config: config.import, columnMappings })
        : await parseCSV(file, { config: config.import, columnMappings });

      setParseResult(result);
      setProgress({ stage: 'idle', progress: 0, message: '' });
      setStep('validation');
    } catch (error) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Validation failed',
      });
    }
  }, [file, config.import, columnMappings]);

  const handleImport = useCallback(async () => {
    if (!parseResult) return;

    setStep('importing');
    setProgress({
      stage: 'importing',
      progress: 0,
      message: 'Starting import...',
      processedRows: 0,
      totalRows: parseResult.validRows,
    });

    try {
      const validRows = parseResult.rows.filter((r) => r.isValid);
      const transformedData = transformRows(validRows, config.import);

      const batchSize = config.import.batchSize || 100;
      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < transformedData.length; i += batchSize) {
        const batch = transformedData.slice(i, i + batchSize);
        // Backends report `row` 1-based WITHIN the batch (`i + 1`), so the
        // batch offset must be the raw index — `i + 1` double-counted it and
        // every reported row number came out one too high.
        const batchStartRow = i;

        try {
          const response = await api.post(config.api.bulkCreate, { items: batch });
          const result = response.data.data;

          // `??` not `||` — a batch where every row failed returns created: 0,
          // which is falsy and used to report the whole batch as imported.
          successCount += result.created ?? batch.length;
          if (result.errors) {
            result.errors.forEach((err: { row: number; message: string }) => {
              errors.push({ row: batchStartRow + err.row, message: err.message });
              errorCount++;
            });
          }
        } catch (error) {
          batch.forEach((_, idx) => {
            errors.push({
              row: batchStartRow + idx,
              message: error instanceof Error ? error.message : 'Import failed',
            });
            errorCount++;
          });
        }

        const processedRows = Math.min(i + batchSize, transformedData.length);
        setProgress({
          stage: 'importing',
          progress: Math.round((processedRows / transformedData.length) * 100),
          message: `Importing batch ${Math.ceil((i + 1) / batchSize)} of ${Math.ceil(transformedData.length / batchSize)}...`,
          processedRows,
          totalRows: transformedData.length,
        });
      }

      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'Import complete!',
        successCount,
        errorCount,
        errors,
      });

      setStep('complete');

      if (onImportComplete) {
        onImportComplete({
          success: errorCount === 0,
          created: successCount,
          updated: 0,
          failed: errorCount,
          errors,
        });
      }
    } catch (error) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Import failed',
      });
    }
  }, [parseResult, config, onImportComplete]);

  const handleDownloadTemplate = useCallback(() => {
    downloadTemplateCSV(config.export, config.entityType);
  }, [config]);

  const canProceedFromMapping = columnMappings
    .filter((m) => m.isRequired)
    .every((m) => m.isMatched);

  const canImport = parseResult && parseResult.validRows > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {config.entityLabel}</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import {config.entityLabel.toLowerCase()} data.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <FileUploadZone
                onFileSelect={handleFileSelect}
                acceptedFormats={['csv', 'xlsx']}
                disabled={progress.stage === 'parsing'}
              />

              {progress.stage === 'parsing' && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progress.message}</span>
                </div>
              )}

              {progress.stage === 'error' && (
                <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {progress.message}
                </div>
              )}

              <div className="flex items-center justify-center">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </div>
          )}

          {step === 'mapping' && parseResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map the columns from your file to the corresponding fields. Required fields must be
                mapped.
              </p>
              <ColumnMappingTable
                mappings={columnMappings}
                availableHeaders={parseResult.headers}
                onMappingChange={handleMappingChange}
              />
            </div>
          )}

          {step === 'validation' && parseResult && (
            <ValidationResults parseResult={parseResult} />
          )}

          {(step === 'importing' || step === 'complete') && (
            <ImportProgressTracker progress={progress} />
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleRevalidate} disabled={!canProceedFromMapping}>
                Validate Data
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === 'validation' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleImport} disabled={!canImport}>
                Import {parseResult?.validRows} Records
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === 'complete' && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
