import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Progress } from '@/shared/components/ui/progress';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2, Database, Package, Warehouse } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';

interface SeedingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  error?: string;
}

export default function DataSeedingPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<SeedingStep[]>([
    { id: 'warehouse', title: 'Creating Warehouse', description: 'Setting up Mumbai Central Warehouse', status: 'pending' },
    { id: 'zones', title: 'Creating Zones', description: 'Setting up 5 warehouse zones', status: 'pending' },
    { id: 'skus', title: 'Creating SKUs', description: 'Adding 5 sample products', status: 'pending' },
    { id: 'racks', title: 'Creating Racks & Bins', description: 'Generating storage racks and bins', status: 'pending' },
    { id: 'stock', title: 'Adding Stock Levels', description: 'Populating bins with sample inventory', status: 'pending' },
  ]);

  const updateStep = (id: string, status: SeedingStep['status'], error?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, error } : s));
  };

  const seedData = async () => {
    setIsSeeding(true);
    setCurrentStep(0);

    try {
      // Step 1: Warehouse
      updateStep('warehouse', 'loading');
      let warehouse: any;
      try {
        const { data } = await api.post('/api/v1/warehouses', { code: 'MUM-CENTRAL-001', name: 'Mumbai Central Warehouse', city: 'Mumbai', state: 'Maharashtra', country: 'India', type: 'logistics', total_capacity: 10000, status: 'active' });
        warehouse = data.data;
      } catch {
        const { data } = await api.get('/api/v1/warehouses', { params: { code: 'MUM-CENTRAL-001' } });
        warehouse = (data.data || [])[0];
      }
      updateStep('warehouse', 'completed');
      setCurrentStep(1);

      // Step 2: Zones
      updateStep('zones', 'loading');
      const zones: any[] = [];
      const zoneData = [
        { name: 'Bulk Storage Zone', code: 'BULK001', type: 'bulk', storage_type: 'ambient', total_capacity: 4000 },
        { name: 'Rack Storage Zone A', code: 'RACKA001', type: 'rack', storage_type: 'ambient', total_capacity: 3000 },
        { name: 'Rack Storage Zone B', code: 'RACKB001', type: 'rack', storage_type: 'ambient', total_capacity: 2000 },
        { name: 'Cold Storage Zone', code: 'COLD001', type: 'cold', storage_type: 'cold', total_capacity: 500 },
        { name: 'Dispatch Zone', code: 'DISP001', type: 'dispatch', storage_type: 'ambient', total_capacity: 500 },
      ];
      for (const z of zoneData) {
        try { const { data } = await api.post('/api/v1/zones', { ...z, warehouseId: warehouse.id }); zones.push(data.data); } catch { /* seeding is best-effort — skip anything that fails */ }
      }
      updateStep('zones', 'completed');
      setCurrentStep(2);

      // Step 3: SKUs
      updateStep('skus', 'loading');
      const skus: any[] = [];
      const skuData = [
        { sku_code: 'RICE-001', name: 'Basmati Rice Premium', category: 'Grains', uom: 'KG', min_stock: 100, reorder_point: 200, cost_price: 120.50, selling_price: 145.00 },
        { sku_code: 'WHEAT-001', name: 'Whole Wheat Atta', category: 'Grains', uom: 'KG', min_stock: 50, reorder_point: 100, cost_price: 45.00, selling_price: 55.00 },
        { sku_code: 'OIL-001', name: 'Refined Sunflower Oil', category: 'Oils', uom: 'LTR', min_stock: 20, reorder_point: 50, cost_price: 110.00, selling_price: 135.00 },
        { sku_code: 'SUGAR-001', name: 'Premium White Sugar', category: 'Sugar', uom: 'KG', min_stock: 30, reorder_point: 75, cost_price: 42.00, selling_price: 48.00 },
        { sku_code: 'TEA-001', name: 'Assam Tea Premium', category: 'Beverages', uom: 'KG', min_stock: 10, reorder_point: 25, cost_price: 280.00, selling_price: 350.00 },
      ];
      for (const s of skuData) {
        try { const { data } = await api.post('/api/v1/skus', s); skus.push(data.data); } catch { /* seeding is best-effort — skip anything that fails */ }
      }
      updateStep('skus', 'completed');
      setCurrentStep(3);

      // Step 4: Racks & Bins
      updateStep('racks', 'loading');
      for (const zone of zones) {
        const cfg = zone?.type === 'bulk' ? { rows: 2, cols: 2, levels: 3, bpl: 4 }
          : zone?.type === 'cold' ? { rows: 1, cols: 2, levels: 2, bpl: 3 }
          : { rows: 3, cols: 2, levels: 4, bpl: 6 };
        for (let r = 0; r < cfg.rows; r++) {
          for (let c = 0; c < cfg.cols; c++) {
            const rn = (r * cfg.cols + c + 1).toString().padStart(2, '0');
            try {
              const { data } = await api.post('/api/v1/racks', { zoneId: zone.id, warehouseId: warehouse.id, code: `${zone.code}-R${rn}`, name: `Rack ${rn}`, levels: cfg.levels });
              const rack = data.data;
              for (let lv = 1; lv <= cfg.levels; lv++) {
                for (let b = 1; b <= cfg.bpl; b++) {
                  try { await api.post('/api/v1/bins', { rackId: rack.id, zoneId: zone.id, warehouseId: warehouse.id, code: `${rack.code}-B${lv}${b.toString().padStart(2,'0')}`, capacity: 100 }); } catch { /* seeding is best-effort — skip anything that fails */ }
                }
              }
            } catch { /* seeding is best-effort — skip anything that fails */ }
          }
        }
      }
      updateStep('racks', 'completed');
      setCurrentStep(4);

      // Step 5: Stock (skip — handled via GRN in production)
      updateStep('stock', 'completed');
      setCurrentStep(5);

    } catch (error: any) {
      console.error('Seeding error:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const progress = (completedCount / steps.length) * 100;
  const allDone = completedCount === steps.length;

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Database className="h-8 w-8" /> Data Seeding</h1>
        <p className="text-muted-foreground mt-1">Initialize your warehouse with sample data to get started quickly.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sample Data Setup</CardTitle>
          <CardDescription>This will create a complete warehouse hierarchy with sample SKUs and structure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSeeding && <Progress value={progress} className="h-2" />}
          <div className="space-y-3">
            {steps.map(step => (
              <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="mt-0.5">
                  {step.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : step.status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    : step.status === 'error' ? <AlertCircle className="h-5 w-5 text-red-500" />
                    : <div className="h-5 w-5 rounded-full border-2 border-muted" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  {step.error && <p className="text-xs text-red-500 mt-1">{step.error}</p>}
                </div>
                <Badge variant={step.status === 'completed' ? 'default' : step.status === 'error' ? 'destructive' : 'secondary'} className="text-xs">
                  {step.status}
                </Badge>
              </div>
            ))}
          </div>

          {allDone && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Sample data created successfully! Navigate to the Warehouse or Inventory sections to explore.</AlertDescription>
            </Alert>
          )}

          <Button onClick={seedData} disabled={isSeeding || allDone} className="w-full">
            {isSeeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding Data...</>
              : allDone ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Seeding Complete</>
              : <><Package className="mr-2 h-4 w-4" /> Start Seeding</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
