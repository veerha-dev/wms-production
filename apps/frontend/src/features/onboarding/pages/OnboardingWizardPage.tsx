import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { useToast } from '@/shared/components/ui/use-toast';
import { useAuth } from '@/shared/contexts/AuthContext';
import { api } from '@/shared/lib/api';
import { onboardingApi } from '../api/onboarding.api';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { WarehouseStep } from '../components/WarehouseStep';
import { LayoutStep } from '../components/LayoutStep';
import { SkusStep } from '../components/SkusStep';
import { SuppliersStep } from '../components/SuppliersStep';
import { TeamStep } from '../components/TeamStep';

type StepId = 'warehouse' | 'layout' | 'skus' | 'suppliers' | 'team';

interface StepDef {
  id: StepId;
  label: string;
  description: string;
}

const STEPS: StepDef[] = [
  { id: 'warehouse', label: 'Create Warehouse', description: 'Set up your first warehouse with address, capacity, and contact details.' },
  { id: 'layout', label: 'Set Up Layout', description: 'Define zones, aisles, racks, levels and positions — bins are generated automatically.' },
  { id: 'skus', label: 'Add SKUs', description: 'Add product master data manually or import from CSV.' },
  { id: 'suppliers', label: 'Add Suppliers', description: 'Capture suppliers you order from so you can raise POs.' },
  { id: 'team', label: 'Invite Team', description: 'Invite managers and workers. They receive temporary credentials by email.' },
];

export default function OnboardingWizardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: status, refetch } = useOnboardingStatus();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Auto-detect already-done steps when status changes (e.g. user comes back later)
  const stepDone = useMemo(() => {
    return {
      warehouse: !!status?.hasWarehouse,
      layout: !!status?.hasLayout,
      skus: !!status?.hasSkus,
      suppliers: !!status?.hasSuppliers,
      team: !!status?.hasInvitedUsers,
    };
  }, [status]);

  // Auto-fetch the first warehouse ID if a warehouse exists for this tenant
  useEffect(() => {
    if (status?.hasWarehouse && !warehouseId) {
      api.get('/api/v1/warehouses', { params: { limit: 1 } })
        .then((res) => {
          const list = res.data?.data || [];
          if (list.length > 0) {
            setWarehouseId(list[0].id);
          }
        })
        .catch((err) => {
          console.error('Failed to auto-fetch warehouse for onboarding:', err);
        });
    }
  }, [status?.hasWarehouse, warehouseId]);

  // If everything is done OR onboarding marked complete, send admin to dashboard
  useEffect(() => {
    if (!status) return;
    if (status.onboardingCompletedAt) {
      navigate('/', { replace: true });
    }
  }, [status, navigate]);

  // Only admins should land here
  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void finish();
    }
  };

  const goBack = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const finish = async () => {
    setCompleting(true);
    try {
      await onboardingApi.complete();
      toast({ title: 'Setup complete', description: 'Welcome to Veerha WMS.' });
      navigate('/', { replace: true });
    } catch (err: any) {
      toast({
        title: 'Could not complete setup',
        description: err?.response?.data?.message || err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCompleting(false);
    }
  };

  const handleSkipAll = async () => {
    await finish();
  };

  const stepProps = {
    warehouseId,
    setWarehouseId,
    onCompleted: async () => {
      await refetch();
      goNext();
    },
    onSkip: goNext,
  };

  const step = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 py-8 px-4 md:px-8">
      <div className="mx-auto max-w-7xl w-full">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wide">Welcome to Veerha WMS</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">Let's get your warehouse running</h1>
            <p className="mt-1 text-muted-foreground">
              Five quick steps. Skip any you'd rather do later from inside the app.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkipAll} disabled={completing}>
            <SkipForward className="mr-1 h-4 w-4" />
            Skip all
          </Button>
        </div>

        {/* Stepper */}
        <div className="mb-8 flex items-center justify-between gap-2">
          {STEPS.map((s, idx) => {
            const isActive = idx === currentStep;
            const isDone = stepDone[s.id] || idx < currentStep;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(idx)}
                className="flex flex-1 items-center gap-2 text-left disabled:opacity-50"
                disabled={completing}
              >
                <div
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isDone
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-muted-foreground/30 text-muted-foreground',
                  ].join(' ')}
                >
                  {isDone && !isActive ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                <div className="hidden flex-1 md:block">
                  <div className={['text-xs font-medium', isActive ? 'text-foreground' : 'text-muted-foreground'].join(' ')}>
                    Step {idx + 1}
                  </div>
                  <div className="truncate text-sm">{s.label}</div>
                </div>
                {idx < STEPS.length - 1 && <div className="ml-2 hidden h-px flex-1 bg-muted-foreground/30 md:block" />}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{step.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
          </div>

          <div>
            {step.id === 'warehouse' && (
              <WarehouseStep {...stepProps} />
            )}
            {step.id === 'layout' && (
              <LayoutStep {...stepProps} status={status} />
            )}
            {step.id === 'skus' && (
              <SkusStep {...stepProps} />
            )}
            {step.id === 'suppliers' && (
              <SuppliersStep {...stepProps} />
            )}
            {step.id === 'team' && (
              <TeamStep {...stepProps} status={status} />
            )}
          </div>

          {/* Navigation footer */}
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={currentStep === 0 || completing}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={goNext} disabled={completing}>
                Skip this step
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              {currentStep === STEPS.length - 1 && (
                <Button size="sm" onClick={finish} disabled={completing}>
                  Finish setup
                  <Check className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
