import { useWMS } from '@/shared/contexts/WMSContext';
import { Search, HelpCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { NotificationCenter } from '@/shared/components/NotificationCenter';

interface HeaderProps {
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function Header({ title, breadcrumbs }: HeaderProps) {
  const { tenant, currentUser } = useWMS();

  return (
    <header className="h-16 bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-30">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Left: Breadcrumbs & Title */}
        <div className="flex flex-col">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="h-3 w-3" />}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </a>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        </div>

        {/* Right: Search, Notifications, Help */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, order, location..."
              className="pl-9 w-64 h-9 bg-muted/50 border-transparent focus:border-accent focus:bg-background"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>

          {/* Notifications */}
          <NotificationCenter />

          {/* Help */}
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <HelpCircle className="h-4 w-4" />
          </Button>

          {/* Tenant Badge */}
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-border">
            <div className="text-right">
              <p className="text-sm font-medium">{tenant?.name}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
