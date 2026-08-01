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

  it('rejects a malformed email with an inline message', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Email', 'not-an-email');
    submit();

    // The input is type="text", so nothing aborts the submit before zod runs
    // and the user gets a real FormMessage instead of a browser bubble.
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('uses type="text" + inputMode="email" so zod owns email validation', () => {
    renderDialog();
    const input = screen.getByLabelText('Email');
    // type="email" would hand validation to the browser and make the schema's
    // message unreachable — see the test above.
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'email');
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

  it.each(['39', '88', '00', '98'])(
    'rejects a well-formed GSTIN on unissued state code %s',
    async (code) => {
      renderDialog();
      fillBasics();
      // The shape is fine; the state code was never issued, so no State can be
      // derived and the CGST+SGST / IGST split would be wrong. The backend
      // rejects these too — validating here keeps the error inline.
      type('GSTIN *', `${code}ABCDE1234F1Z5`);
      submit();

      expect(
        await screen.findByText(`GSTIN state code ${code} is not a valid Indian state code`)
      ).toBeInTheDocument();
      expect(mocks.createMutate).not.toHaveBeenCalled();
    }
  );

  it('names the bad code rather than repeating the generic format error', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '39ABCDE1234F1Z5');
    submit();

    expect(
      await screen.findByText('GSTIN state code 39 is not a valid Indian state code')
    ).toBeInTheDocument();
    // A well-formed GSTIN must not also trip the shape checks.
    expect(
      screen.queryByText('GSTIN format looks invalid (e.g. 33ABCDE1234F1Z5)')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('GSTIN must be exactly 15 characters')).not.toBeInTheDocument();
  });

  it('lets the user recover by correcting the state code', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '39ABCDE1234F1Z5');
    submit();
    await screen.findByText('GSTIN state code 39 is not a valid Indian state code');

    type('GSTIN *', '33ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      gstNumber: '33ABCDE1234F1Z5',
      state: 'Tamil Nadu',
    });
  });

  it.each(['97', '99'])('still accepts the non-state code %s', async (code) => {
    // 97 (Other Territory) and 99 (Centre Jurisdiction) are genuinely issued.
    renderDialog();
    fillBasics();
    type('GSTIN *', `${code}ABCDE1234F1Z5`);
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({
      gstNumber: `${code}ABCDE1234F1Z5`,
    });
  });

  it.each(['25', '28'])('still accepts the legacy code %s on existing GSTINs', async (code) => {
    renderDialog();
    fillBasics();
    type('GSTIN *', `${code}ABCDE1234F1Z5`);
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
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
  it('uses type="text" + inputMode="decimal" so the schema sees what was typed', () => {
    renderDialog();
    const input = screen.getByLabelText('Credit Limit (₹)');
    // type="number" would sanitise non-numeric text to '' and block submit via
    // min="0", making both schema messages unreachable from the UI.
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('rejects non-numeric text with an inline message', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Credit Limit (₹)', 'lots');
    submit();

    expect(await screen.findByText('Credit limit must be a number')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('rejects a negative credit limit in the schema, matching the CSV importer', async () => {
    // The importer has always rejected negatives ("Must be a positive amount").
    // The form used to rely only on the input's min="0", so the two entry
    // points disagreed the moment the attribute was bypassed.
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Credit Limit (₹)', '-500');
    submit();

    expect(await screen.findByText('Credit limit cannot be negative')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('accepts zero — a real limit, not a missing one', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Credit Limit (₹)', '0');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    // '0' is falsy as a string check would have it — pin that it is sent as a
    // number, not silently turned into null.
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ creditLimit: 0 });
  });

  it('accepts a decimal amount', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    type('Credit Limit (₹)', '2500.50');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ creditLimit: 2500.5 });
  });

  it('treats a blank credit limit as no limit', async () => {
    renderDialog();
    fillBasics();
    type('GSTIN *', '33ABCDE1234F1Z5');
    submit();

    await waitFor(() => expect(mocks.createMutate).toHaveBeenCalledTimes(1));
    expect(mocks.createMutate.mock.calls[0][0]).toMatchObject({ creditLimit: null });
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

  it('rejects an unissued state code here too', async () => {
    // Quick mode derives State straight from the GSTIN prefix, so an unissued
    // code is if anything worse here — there is no State picker to correct it.
    renderDialog({ mode: 'quick' });
    fillBasics();
    type('GSTIN *', '39ABCDE1234F1Z5');
    submit();

    expect(
      await screen.findByText('GSTIN state code 39 is not a valid Indian state code')
    ).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
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
