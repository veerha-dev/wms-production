import { Link } from 'react-router-dom';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { useAuth } from '@/shared/contexts/AuthContext';
import { Boxes, ClipboardList, ScanLine, LogOut, ListChecks, PackageCheck } from 'lucide-react';

export default function MobileHomePage() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Worker app</div>
            <div className="font-semibold">{user?.fullName || user?.email}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3">
          <ActionTile to="/m/putaway" icon={Boxes} title="Putaway" subtitle="Scan bin to confirm placement" />
          <ActionTile to="/m/pick" icon={ListChecks} title="Pick" subtitle="Scan SKU to record picks" />
          <ActionTile to="/m/pack" icon={PackageCheck} title="Pack" subtitle="Scan items into the box and weigh it" />
          <ActionTile to="/m/cycle-count" icon={ClipboardList} title="Cycle Count" subtitle="Scan bins and record physical counts" />
        </div>
      </div>
    </div>
  );
}

function ActionTile({ to, icon: Icon, title, subtitle }: { to: string; icon: any; title: string; subtitle: string }) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-4 p-4 active:scale-[0.99]">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <ScanLine className="h-5 w-5 text-muted-foreground" />
      </Card>
    </Link>
  );
}
