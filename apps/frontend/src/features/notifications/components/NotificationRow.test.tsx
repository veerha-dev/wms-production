/**
 * NotificationRow is the single row implementation shared by the header bell
 * panel and the Notification Center page, so the read/unread affordance and the
 * grouped-count badge are rendered from one place — worth pinning.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationRow } from './NotificationRow';
import type { Notification } from '@/features/notifications/types';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    eventType: 'grn.created',
    category: 'inbound',
    severity: 'info',
    title: 'GRN-0042 received',
    body: 'Awaiting QC inspection at Dock 3',
    linkPath: '/inbound/grn/42',
    entityType: 'grn',
    entityId: '42',
    requiresAction: false,
    actionState: null,
    groupCount: 1,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('unread vs read', () => {
  it('marks an unread row with the dot indicator', () => {
    render(<NotificationRow notification={makeNotification({ isRead: false })} />);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
  });

  it('drops the dot once the notification is read', () => {
    render(
      <NotificationRow
        notification={makeNotification({ isRead: true, readAt: new Date().toISOString() })}
      />
    );
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  it('renders the title and body', () => {
    render(<NotificationRow notification={makeNotification()} />);
    expect(screen.getByText('GRN-0042 received')).toBeInTheDocument();
    expect(screen.getByText('Awaiting QC inspection at Dock 3')).toBeInTheDocument();
  });

  it('omits the body paragraph entirely when there is none', () => {
    render(<NotificationRow notification={makeNotification({ body: null })} />);
    expect(screen.queryByText('null')).not.toBeInTheDocument();
    expect(screen.getByText('GRN-0042 received')).toBeInTheDocument();
  });
});

describe('grouping', () => {
  it('shows the count badge when several events collapsed into one row', () => {
    render(<NotificationRow notification={makeNotification({ groupCount: 12 })} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows no badge for a single event', () => {
    render(<NotificationRow notification={makeNotification({ groupCount: 1 })} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows no badge when groupCount is missing', () => {
    const n = makeNotification();
    delete (n as Partial<Notification>).groupCount;
    render(<NotificationRow notification={n} />);
    expect(screen.getByText('GRN-0042 received')).toBeInTheDocument();
  });
});

describe('action state', () => {
  it('flags an actionable notification in the full (non-compact) layout', () => {
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'pending' })}
      />
    );
    expect(screen.getByText('Action needed')).toBeInTheDocument();
  });

  it('replaces the prompt with the outcome once resolved', () => {
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'approved' })}
      />
    );
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.queryByText('Action needed')).not.toBeInTheDocument();
  });

  it('renders Approve / Reject only when the inbox asks for them', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'pending' })}
        showActions
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('hides the buttons once the notification has been actioned', () => {
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'rejected' })}
        showActions
      />
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('disables the buttons while a mutation is in flight', () => {
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'pending' })}
        showActions
        actionPending
      />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});

describe('interaction', () => {
  it('calls onClick with the notification', () => {
    const onClick = vi.fn();
    const n = makeNotification();
    render(<NotificationRow notification={n} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /GRN-0042 received/i }));
    expect(onClick).toHaveBeenCalledWith(n);
  });

  it('is keyboard operable', () => {
    const onClick = vi.fn();
    render(<NotificationRow notification={makeNotification()} onClick={onClick} />);

    const row = screen.getByRole('button', { name: /GRN-0042 received/i });
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not fire the row click when Approve is pressed', () => {
    const onClick = vi.fn();
    const onApprove = vi.fn();
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'pending' })}
        onClick={onClick}
        showActions
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('compact layout', () => {
  it('drops the "Action needed" badge in the header dropdown', () => {
    render(
      <NotificationRow
        notification={makeNotification({ requiresAction: true, actionState: 'pending' })}
        compact
      />
    );
    expect(screen.queryByText('Action needed')).not.toBeInTheDocument();
    expect(screen.getByText('GRN-0042 received')).toBeInTheDocument();
  });
});

describe('timestamps', () => {
  it('renders a relative time for a valid date', () => {
    render(
      <NotificationRow
        notification={makeNotification({
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        })}
      />
    );
    expect(screen.getByText(/ago$/)).toBeInTheDocument();
  });

  it('renders nothing rather than "Invalid Date" for a broken timestamp', () => {
    render(<NotificationRow notification={makeNotification({ createdAt: 'not-a-date' })} />);
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
    expect(screen.getByText('GRN-0042 received')).toBeInTheDocument();
  });
});
