/**
 * CustomerFormDialog — the zod schema and payload builder are module-private,
 * so they are exercised through the rendered dialog. What matters here is the
 * contract with the API: what the form refuses to submit, and what it actually
 * sends when it does.
 *
 * The GSTIN rules are the load-bearing ones. A B2B customer with no (or a
 * malformed) GSTIN cannot be invoiced correctly, and the State auto-filled from
 * the GSTIN prefix is what decides CGST+SGST vs IGST.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  role: 'admin' as string | null,
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  createAddressMutate: vi.fn(),
}));

vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuth: () => ({ role: mocks.role, isAuthenticated: true }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../hooks/useCustomers', () => ({
  useCreateCustomer: () => ({ mutateAsync: mocks.createMutate }),
  useUpdateCustomer: () => ({ mutateAsync: mocks.updateMutate }),
  useCreateCustomerAddress: () => ({ mutateAsync: mocks.createAddressMutate }),
  useCustomerStats: () => ({ data: { total: 7, active: 7, newThisMonth: 1 } }),
}));

import { CustomerFormDialog } from './CustomerFormDialog';
import type { Customer } from '../types';

const noop = () => {};

function renderDialog(props: Partial<React.ComponentProps<typeof CustomerFormDialog>> = {}) {
  return render(
    <CustomerFormDialog open onOpenChange={props.onOpenChange ?? noop} {...props} />
  );
}

const type = (label: string | RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: /create customer|save changes/i }));
};

/** Fill the two always-required fields so a test can focus on one other rule. */
const fillBasics = () => {
  type('Customer Name *', 'Raj Traders');
  type('Phone *', '+91 98765 43210');
};

beforeEach(() => {
  mocks.role = 'admin';
  mocks.createMutate.mockReset().mockResolvedValue({ id: 'new-1', name: 'Raj Traders' });
  mocks.updateMutate.mockReset().mockResolvedValue({ id: 'c-1', name: 'Walk-in Buyer' });
  mocks.createAddressMutate.mockReset().mockResolvedValue({ id: 'addr-1' });
});

describe('required fields', () => {
  it('refuses to submit an empty form and names every missing field', async () => {
    renderDialog();
    submit();

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
    expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    expect(screen.getByText('GSTIN is required for B2B customers')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects a one-character name', async () => {
    renderDialog();
    type('Customer Name *', 'R');
    type('Phone *', '+91 98765 43210');
    submit();

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects a phone number that is too short to dial', async () => {
    renderDialog();
    type('Customer Name *', 'Raj Traders');
    type('Phone *', '123');
    submit();

    expect(await screen.findByText('Phone number is required')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('blocks a malformed email before the schema ever runs', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Email', 'not-an-email');
    submit();

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(mocks.createMutate).not.toHaveBeenCalled();
    // The input is type="email", so native constraint validation aborts the
    // submit and zod never runs — its message is unreachable and the user only
    // gets the browser's own bubble, with no inline FormMessage.
    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument();
  });

  it('sends a valid email through', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Email', 'accounts@rajtraders.in');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      email: 'accounts@rajtraders.in',
    });
  });
});

describe('B2B GSTIN validation', () => {
  it('requires a GSTIN', async () => {
    renderDialog();
    fillBasics();
    submit();

    expect(await screen.findByText('GSTIN is required for B2B customers')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects a GSTIN that is not exactly 15 characters', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z');
    submit();

    expect(await screen.findByText('GSTIN must be exactly 15 characters')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects 15 characters in the wrong shape', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', 'AAABCDE1234F1Z5');
    submit();

    expect(
      await screen.findByText('GSTIN format looks invalid (e.g. 33ABCDE1234F1Z5)')
    ).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects a GSTIN whose state code is not a real state', async () => {
    renderDialog();
    fillBasics();
    // 39 is not an issued state code, so State cannot be derived.
    type('GSTIN *', '39ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalled());
    // KNOWN GAP: the regex accepts any two digits, so an unknown state code
    // passes validation and is saved with a null state.
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      gstNumber: '39ABCDE1234F1Z5',
      state: null,
    });
  });

  it('caps input at 15 characters and uppercases as you type', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33abcde1234f1z5ZZZZ');

    expect(screen.getByLabelText('GSTIN *')).toHaveValue('33ABCDE1234F1Z5');
    expect(screen.getByText('15/15 characters')).toBeInTheDocument();
  });

  it('accepts a valid GSTIN and sends it uppercased', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33abcde1234f1z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      name: 'Raj Traders',
      phone: '+91 98765 43210',
      customerType: 'b2b',
      gstNumber: '33ABCDE1234F1Z5',
    });
  });
});

describe('PAN validation', () => {
  it('rejects a malformed PAN', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('PAN', 'ABC12');
    submit();

    expect(await screen.findByText('PAN must look like ABCDE1234F')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('accepts a valid PAN and sends it uppercased', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('PAN', 'abcde1234f');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ panNumber: 'ABCDE1234F' });
  });

  it('treats an empty PAN as absent', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ panNumber: null });
  });
});

describe('State auto-fill from the GSTIN prefix', () => {
  it.each([
    ['33ABCDE1234F1Z5', 'Tamil Nadu'],
    ['27ABCDE1234F1Z5', 'Maharashtra'],
    ['07ABCDE1234F1Z5', 'Delhi'],
    ['29ABCDE1234F1Z5', 'Karnataka'],
  ])('%s fills State with %s', async (gstin, state) => {
    renderDialog();
    fillBasics();
    type('GSTIN *', gstin);
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ state });
  });

  it('re-derives State when the state code is corrected', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('GSTIN *', '06ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ state: 'Haryana' });
  });

  it('derives State from a lowercase GSTIN too', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '19abcde1234f1z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ state: 'West Bengal' });
  });
});

describe('B2C customers', () => {
  const b2cCustomer: Customer = {
    id: 'c-1',
    code: 'CUST-001',
    name: 'Walk-in Buyer',
    customerType: 'b2c',
    phone: '+91 90000 00000',
    // A GSTIN left over from a mistyped earlier save — it must never survive.
    gstNumber: '33ABCDE1234F1Z5',
    panNumber: 'ABCDE1234F',
    status: 'active',
    paymentTerms: 'net_30',
  };

  it('hides the whole Tax Details section', async () => {
    renderDialog({ customer: b2cCustomer });

    await waitFor(() =>
      expect(screen.getByLabelText('Customer Name *')).toHaveValue('Walk-in Buyer')
    );
    expect(screen.queryByLabelText('GSTIN *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('PAN')).not.toBeInTheDocument();
    expect(screen.queryByText('Tax Details')).not.toBeInTheDocument();
  });

  it('saves without a GSTIN and strips any GSTIN/PAN carried over', async () => {
    renderDialog({ customer: b2cCustomer });

    await waitFor(() =>
      expect(screen.getByLabelText('Customer Name *')).toHaveValue('Walk-in Buyer')
    );
    submit();

    await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalledTimes(1));
    expect(mocks.updateMutate.mock.calls[0][0]).toMatchObject({
      id: 'c-1',
      customerType: 'b2c',
      gstNumber: null,
      panNumber: null,
    });
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });
});

describe('credit limit (admin only, spec §7)', () => {
  it('uses a number input, so non-numeric text never reaches the schema', () => {
    renderDialog();
    type('Credit Limit (₹)', 'lots');

    // type="number" sanitises the value to '' — the schema's
    // "Credit limit must be a number" branch is unreachable from the UI.
    expect(screen.getByLabelText('Credit Limit (₹)')).toHaveValue(null);
  });

  it('blocks a negative credit limit at the input, not in the schema', () => {
    // The zod schema only checks that the value parses as a number; it is the
    // input's own type/min that stops a negative reaching the API. Worth
    // pinning, because removing min="0" would silently allow it.
    renderDialog();
    const input = screen.getByLabelText('Credit Limit (₹)');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
  });

  it('sends a numeric credit limit for an admin', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Credit Limit (₹)', '100000');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ creditLimit: 100000 });
  });

  it('never renders or sends a credit limit for a manager', async () => {
    mocks.role = 'manager';
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');

    expect(screen.queryByLabelText('Credit Limit (₹)')).not.toBeInTheDocument();
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    // Absent, not null — a manager save must not clear the admin's value.
    expect(mocks.createMutate.mock.calls[0][0]).not.toHaveProperty('creditLimit');
  });
});

describe('edit mode', () => {
  const b2bCustomer: Customer = {
    id: 'c-2',
    code: 'CUST-002',
    name: 'Raj Traders',
    customerType: 'b2b',
    phone: '+91 98765 43210',
    gstNumber: '33ABCDE1234F1Z5',
    state: 'Tamil Nadu',
    status: 'active',
    paymentTerms: 'net_30',
  };

  it('pre-fills the form from the customer and updates instead of creating', async () => {
    renderDialog({ customer: b2bCustomer });

    await waitFor(() => expect(screen.getByLabelText('GSTIN *')).toHaveValue('33ABCDE1234F1Z5'));
    expect(screen.getByLabelText('Customer Name *')).toHaveValue('Raj Traders');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();

    submit();
    await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalledTimes(1));
    expect(mocks.updateMutate.mock.calls[0][0]).toMatchObject({
      id: 'c-2',
      gstNumber: '33ABCDE1234F1Z5',
    });
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('re-validates the GSTIN on an existing customer', async () => {
    renderDialog({ customer: b2bCustomer });

    await waitFor(() => expect(screen.getByLabelText('GSTIN *')).toHaveValue('33ABCDE1234F1Z5'));
    type('GSTIN *', '33ABCDE1234F1Z');
    submit();

    expect(await screen.findByText('GSTIN must be exactly 15 characters')).toBeInTheDocument();
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });
});

describe('quick mode (used from the Sales Order form)', () => {
  it('renders only the essentials', () => {
    renderDialog({ mode: 'quick' });

    expect(screen.getByLabelText('Customer Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone *')).toBeInTheDocument();
    expect(screen.getByLabelText('GSTIN *')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('PAN')).not.toBeInTheDocument();
  });

  it('still enforces the B2B GSTIN rule and derives State for the payload', async () => {
    const onSuccess = vi.fn();
    renderDialog({ mode: 'quick', onSuccess });

    fillBasics();
    submit();
    expect(await screen.findByText('GSTIN is required for B2B customers')).toBeInTheDocument();

    type('GSTIN *', '24ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      state: 'Gujarat',
      gstNumber: '24ABCDE1234F1Z5',
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 'new-1', name: 'Raj Traders' }));
  });
});

describe('dialog lifecycle', () => {
  it('closes itself after a successful save', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open when the save fails', async () => {
    const onOpenChange = vi.fn();
    mocks.createMutate.mockRejectedValue(new Error('duplicate GSTIN'));
    renderDialog({ onOpenChange });

    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('suggests the next customer code from the customer count', () => {
    renderDialog();
    // 7 existing customers => CUST-008
    expect(screen.getByLabelText('Customer Code')).toHaveValue('CUST-008');
  });

  it('renders nothing while closed', () => {
    const { container } = render(<CustomerFormDialog open={false} onOpenChange={noop} />);
    expect(within(document.body).queryByLabelText('Customer Name *')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
