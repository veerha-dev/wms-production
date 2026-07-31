import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/components/ui/command';
import { Badge } from '@/shared/components/ui/badge';
import { useCustomerSearch } from '../hooks/useCustomers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { CustomerSearchResult } from '../types';

export interface CustomerComboboxProps {
  /** Currently selected customer (null for the free-text / walk-in path). */
  value?: CustomerSearchResult | null;
  onSelect: (customer: CustomerSearchResult) => void;
  /** Renders a "+ New Customer" entry inside the dropdown when provided. */
  onCreateNew?: () => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Server-backed typeahead over /api/v1/customers/search.
 * Input is debounced ~300ms and only queries at 2+ characters.
 */
export function CustomerCombobox({
  value,
  onSelect,
  onCreateNew,
  onClear,
  placeholder = 'Search customers by name, code or phone…',
  disabled,
  className,
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data: results = [], isFetching } = useCustomerSearch(debouncedQuery, open);

  // Reset the typed query whenever the popover closes so the next open starts clean.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const tooShort = debouncedQuery.trim().length < 2;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? `${value.name}${value.code ? ` · ${value.code}` : ''}` : 'Select a customer'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {/* shouldFilter=false: the server already ranked these results. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            )}

            {!isFetching && tooShort && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}

            {/*
              A plain div rather than CommandEmpty: the always-present
              "+ New Customer" item keeps cmdk's filtered count above zero, so
              CommandEmpty would never render.
            */}
            {!isFetching && !tooShort && results.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No customers matched “{debouncedQuery}”.
              </div>
            )}

            {!isFetching && results.length > 0 && (
              <CommandGroup heading="Customers">
                {results.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.id}
                    onSelect={() => {
                      onSelect(customer);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value?.id === customer.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{customer.name}</span>
                        {customer.code && (
                          <Badge variant="secondary" className="text-[10px]">
                            {customer.code}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[customer.phone, customer.gstNumber].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(onCreateNew || (value && onClear)) && <CommandSeparator />}

            <CommandGroup>
              {onCreateNew && (
                <CommandItem
                  value="__create_new_customer__"
                  onSelect={() => {
                    setOpen(false);
                    onCreateNew();
                  }}
                  className="cursor-pointer text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Customer
                </CommandItem>
              )}
              {value && onClear && (
                <CommandItem
                  value="__clear_customer__"
                  onSelect={() => {
                    setOpen(false);
                    onClear();
                  }}
                  className="cursor-pointer text-muted-foreground"
                >
                  <User className="mr-2 h-4 w-4" />
                  Clear selection (walk-in / one-off customer)
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CustomerCombobox;
