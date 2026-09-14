import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickListsService } from './pick-lists.service';
import { PickListsRepository } from './pick-lists.repository';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { NotificationsService } from '../notifications/notifications.service';
import { runWithTenant } from '../common/tenant.context';

/**
 * Locks in the fix for the hollow-completion bug: `pick/:itemId` used to be a
 * stub that echoed success without writing quantity_picked, and complete()
 * had no guard — together a pick list could finish with every line still at
 * zero, silently handing an empty order to packing.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';
const PICK_LIST = '9c000000-0000-4000-8000-000000000001';
const ITEM = '9c100000-0000-4000-8000-000000000001';

describe('PickListsService', () => {
  let service: PickListsService;
  let dbQuery: jest.Mock;
  let repository: jest.Mocked<Partial<PickListsRepository>> & { db: { query: jest.Mock } };

  beforeEach(async () => {
    dbQuery = jest.fn(async () => ({ rows: [] }));
    repository = {
      db: { query: dbQuery },
      findById: jest.fn(async () => ({ id: PICK_LIST, warehouseId: 'wh-1', pickListNumber: 'PL-0001' })) as any,
      updateStatus: jest.fn(async (_id, _t, status) => ({ id: PICK_LIST, status })) as any,
    } as any;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PickListsService,
        { provide: PickListsRepository, useValue: repository },
        { provide: DocumentNumberingService, useValue: { nextNumber: jest.fn() } },
        { provide: NotificationsService, useValue: { emit: jest.fn(async () => undefined) } },
      ],
    }).compile();

    service = moduleRef.get(PickListsService);
  });

  const run = <T>(fn: () => Promise<T>) => runWithTenant(TENANT, fn);

  describe('setItemPicked', () => {
    it('persists the picked quantity, unlike the old stub that only echoed it back', async () => {
      dbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT pli.id')) {
          return { rows: [{ id: ITEM, quantity_required: 10, quantity_picked: 0 }] };
        }
        return { rows: [] };
      });

      const result = await run(() => service.setItemPicked(PICK_LIST, ITEM, 10));

      expect(result.quantityPicked).toBe(10);
      expect(result.status).toBe('completed');
      const updateCall = dbQuery.mock.calls.find(([sql]) => sql.includes('UPDATE pick_list_items'));
      expect(updateCall[1]).toEqual([10, 'completed', ITEM]);
    });

    it('caps at quantityRequired — a picker cannot enter more than was asked', async () => {
      dbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT pli.id')) {
          return { rows: [{ id: ITEM, quantity_required: 10, quantity_picked: 0 }] };
        }
        return { rows: [] };
      });

      const result = await run(() => service.setItemPicked(PICK_LIST, ITEM, 99));
      expect(result.quantityPicked).toBe(10);
    });

    it('404s an item that does not belong to this pick list / tenant', async () => {
      dbQuery.mockImplementation(async () => ({ rows: [] }));
      await expect(run(() => service.setItemPicked(PICK_LIST, ITEM, 5)))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a negative quantity', async () => {
      await expect(run(() => service.setItemPicked(PICK_LIST, ITEM, -1)))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('complete', () => {
    it('refuses to complete while any line is short — the hollow-completion bug', async () => {
      dbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('short_count')) return { rows: [{ short_count: 1 }] };
        return { rows: [] };
      });

      await expect(run(() => service.complete(PICK_LIST)))
        .rejects.toThrow(/not fully picked/i);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('completes once every line is fully picked', async () => {
      dbQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('short_count')) return { rows: [{ short_count: 0 }] };
        return { rows: [] };
      });

      const result = await run(() => service.complete(PICK_LIST));
      expect(result.status).toBe('completed');
      expect(repository.updateStatus).toHaveBeenCalledWith(
        PICK_LIST, TENANT, 'completed', expect.objectContaining({ completedAt: expect.any(Date) }),
      );
    });
  });
});
