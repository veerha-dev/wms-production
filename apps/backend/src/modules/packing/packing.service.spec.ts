import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PackingService } from './packing.service';
import { PackingRepository } from './packing.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { runWithTenant } from '../common/tenant.context';

/**
 * The rules that make packing worth doing: the picked quantities actually reach
 * the bench, a barcode that is not on the order is refused, and an order cannot
 * leave the bench half-packed, unweighed, or in no box at all.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';
const SO = '50000000-0000-4000-8000-000000000001';
const WAREHOUSE = '22222222-2222-4222-8222-222222222222';
const SESSION = '77777777-7777-4777-8777-777777777777';

const ADMIN = { id: 'u-admin', role: 'admin' };
const MANAGER_ELSEWHERE = { id: 'u-mgr', role: 'manager', warehouseId: 'another-warehouse' };

const BOXES = [
  { id: 'box-s', code: 'BOX-S', name: 'Small', lengthCm: 20, widthCm: 15, heightCm: 10, maxWeightKg: 5 },
  { id: 'box-m', code: 'BOX-M', name: 'Medium', lengthCm: 40, widthCm: 30, heightCm: 25, maxWeightKg: 15 },
  { id: 'box-l', code: 'BOX-L', name: 'Large', lengthCm: 60, widthCm: 45, heightCm: 40, maxWeightKg: 30 },
];

const order = () => ({
  id: SO,
  soNumber: 'SO-PACK-001',
  status: 'picked',
  warehouseId: WAREHOUSE,
  warehouseName: 'Chennai Main',
  customerName: 'Ramesh Traders',
  shippingAddress: '14 Anna Salai, Chennai',
});

const session = (over: Record<string, any> = {}) => ({
  id: SESSION,
  soId: SO,
  warehouseId: WAREHOUSE,
  status: 'packing',
  carrier: null,
  trackingNumber: null,
  labelUrl: null,
  ...over,
});

describe('PackingService', () => {
  let service: PackingService;
  let repository: jest.Mocked<Partial<PackingRepository>>;

  beforeEach(async () => {
    repository = {
      findOrder: jest.fn(async () => order()) as any,
      findLiveSession: jest.fn(async () => session()) as any,
      findSessionById: jest.fn(async () => session()) as any,
      findPickedQuantities: jest.fn(async () => []) as any,
      createSession: jest.fn(async () => session()) as any,
      findSessionItems: jest.fn(async () => []) as any,
      findPackages: jest.fn(async () => []) as any,
      findActiveBoxes: jest.fn(async () => BOXES) as any,
      findScanCandidates: jest.fn(async () => []) as any,
      findItemById: jest.fn(async () => null) as any,
      findPackageById: jest.fn(async () => null) as any,
      setPackedQuantity: jest.fn(async () => undefined) as any,
      assignItemToPackage: jest.fn(async () => undefined) as any,
      nextPackageNumber: jest.fn(async () => 1) as any,
      createPackage: jest.fn(async (_s: string, dto: any) => ({ id: 'pkg-1', ...dto })) as any,
      updatePackage: jest.fn(async () => ({ id: 'pkg-1' })) as any,
      updateSession: jest.fn(async () => session()) as any,
      updateOrderStatus: jest.fn(async () => undefined) as any,
      completeSession: jest.fn(async () => session({ status: 'ready_for_dispatch' })) as any,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PackingService,
        { provide: PackingRepository, useValue: repository },
        { provide: NotificationsService, useValue: { emit: jest.fn(async () => undefined) } },
      ],
    }).compile();

    service = moduleRef.get(PackingService);
  });

  const run = <T>(fn: () => Promise<T>) => runWithTenant(TENANT, fn);

  describe('opening an order', () => {
    it('seeds the session from the completed pick list rather than the order lines', async () => {
      repository.findLiveSession = jest.fn(async () => null) as any;
      repository.findPickedQuantities = jest.fn(async () => [
        { skuId: 'sku-1', skuCode: 'SKU-BOLT-10', pickedQuantity: 10 },
      ]) as any;

      await run(() => service.openOrder(SO, ADMIN));

      expect(repository.findPickedQuantities).toHaveBeenCalledWith(TENANT, SO);
      expect(repository.createSession).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ items: [expect.objectContaining({ pickedQuantity: 10 })] }),
      );
    });

    it('refuses an order whose picking has not finished, instead of opening it empty', async () => {
      repository.findLiveSession = jest.fn(async () => null) as any;
      repository.findPickedQuantities = jest.fn(async () => []) as any;

      await expect(run(() => service.openOrder(SO, ADMIN))).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('404s an order that does not belong to the tenant', async () => {
      repository.findOrder = jest.fn(async () => null) as any;
      await expect(run(() => service.openOrder(SO, ADMIN))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a manager from packing another warehouse\'s order', async () => {
      await expect(run(() => service.openOrder(SO, MANAGER_ELSEWHERE)))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('scanning', () => {
    const candidates = [
      { id: 'item-1', sku_id: 'sku-1', sku_code: 'SKU-BOLT-10', sku_barcode: '8901234567894', picked_quantity: 10, packed_quantity: 0 },
      { id: 'item-2', sku_id: 'sku-2', sku_code: 'SKU-NUT-10', sku_barcode: null, picked_quantity: 5, packed_quantity: 5 },
    ];

    beforeEach(() => {
      repository.findScanCandidates = jest.fn(async () => candidates) as any;
      repository.findSessionItems = jest.fn(async () => []) as any;
    });

    it('matches on barcode and increments by one', async () => {
      const result = await run(() => service.scanItem(SO, { barcode: '8901234567894' }, ADMIN));
      expect(result.packedQuantity).toBe(1);
      expect(repository.setPackedQuantity).toHaveBeenCalledWith('item-1', 1, 'pending');
    });

    it('falls back to the SKU code, case-insensitively', async () => {
      const result = await run(() => service.scanItem(SO, { barcode: '  sku-bolt-10 ' }, ADMIN));
      expect(result.skuCode).toBe('SKU-BOLT-10');
    });

    it('marks the line packed once the picked quantity is reached', async () => {
      await run(() => service.scanItem(SO, { barcode: '8901234567894', quantity: 10 }, ADMIN));
      expect(repository.setPackedQuantity).toHaveBeenCalledWith('item-1', 10, 'packed');
    });

    it('never packs more than was picked, even if a larger quantity is sent', async () => {
      await run(() => service.scanItem(SO, { barcode: '8901234567894', quantity: 99 }, ADMIN));
      expect(repository.setPackedQuantity).toHaveBeenCalledWith('item-1', 10, 'packed');
    });

    it('refuses a barcode that is not on this order', async () => {
      await expect(run(() => service.scanItem(SO, { barcode: 'SOMETHING-ELSE' }, ADMIN)))
        .rejects.toThrow(/not on this order/i);
      expect(repository.setPackedQuantity).not.toHaveBeenCalled();
    });

    it('refuses to re-pack a line that is already complete', async () => {
      await expect(run(() => service.scanItem(SO, { barcode: 'SKU-NUT-10' }, ADMIN)))
        .rejects.toThrow(/already fully packed/i);
    });
  });

  describe('manual quantity entry', () => {
    beforeEach(() => {
      repository.findItemById = jest.fn(async () => ({
        id: 'item-1', skuCode: 'SKU-BOLT-10', pickedQuantity: 10, packedQuantity: 0,
      })) as any;
      repository.findSessionItems = jest.fn(async () => []) as any;
    });

    it('accepts a quantity up to what was picked', async () => {
      await run(() => service.setItemQuantity(SO, 'item-1', 10, ADMIN));
      expect(repository.setPackedQuantity).toHaveBeenCalledWith('item-1', 10, 'packed');
    });

    it('rejects more than was picked — that cannot physically have happened', async () => {
      await expect(run(() => service.setItemQuantity(SO, 'item-1', 11, ADMIN)))
        .rejects.toThrow(/only 10 were picked/i);
    });

    it('rejects a negative quantity', async () => {
      await expect(run(() => service.setItemQuantity(SO, 'item-1', -1, ADMIN)))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('box suggestion', () => {
    it('picks the smallest box the contents fit into, because oversizing costs freight', async () => {
      // 10 bolts at 10×4×4 = 1600cm³ and 2.5kg — the small box (3000cm³, 5kg) holds it.
      repository.findSessionItems = jest.fn(async () => [
        { id: 'i1', packageId: null, pickedQuantity: 10, lengthCm: 10, widthCm: 4, heightCm: 4, weightKg: 0.25 },
      ]) as any;

      const pkg = await run(() => service.addPackage(SO, {}, ADMIN));
      expect(pkg.boxName).toBe('Small');
      expect(pkg.lengthCm).toBe(20);
    });

    it('steps up to a box that can carry the weight', async () => {
      // Small holds the volume but not 12kg, so the medium (15kg) is the first fit.
      repository.findSessionItems = jest.fn(async () => [
        { id: 'i1', packageId: null, pickedQuantity: 12, lengthCm: 5, widthCm: 5, heightCm: 5, weightKg: 1 },
      ]) as any;

      const pkg = await run(() => service.addPackage(SO, {}, ADMIN));
      expect(pkg.boxName).toBe('Medium');
    });

    it('falls back to the largest box when nothing fits, so the dropdown is never empty', async () => {
      repository.findSessionItems = jest.fn(async () => [
        { id: 'i1', packageId: null, pickedQuantity: 100, lengthCm: 50, widthCm: 50, heightCm: 50, weightKg: 10 },
      ]) as any;

      const pkg = await run(() => service.addPackage(SO, {}, ADMIN));
      expect(pkg.boxName).toBe('Large');
    });

    it('honours an explicitly chosen box over the suggestion', async () => {
      const pkg = await run(() => service.addPackage(SO, { boxId: 'box-l' }, ADMIN));
      expect(pkg.boxName).toBe('Large');
    });

    it('rejects a box that is not in the tenant\'s master', async () => {
      await expect(run(() => service.addPackage(SO, { boxId: 'someone-elses-box' }, ADMIN)))
        .rejects.toThrow(/not in the box master/i);
    });
  });

  describe('completing packing', () => {
    const packedItems = [
      { id: 'i1', skuCode: 'SKU-BOLT-10', pickedQuantity: 10, packedQuantity: 10, packageId: 'pkg-1' },
    ];
    const goodPackage = {
      id: 'pkg-1', packageNumber: 1, boxId: 'box-s', weightKg: 3.2,
      lengthCm: 20, widthCm: 15, heightCm: 10,
    };

    it('moves the order to ready_for_dispatch with the measured totals', async () => {
      repository.findSessionItems = jest.fn(async () => packedItems) as any;
      repository.findPackages = jest.fn(async () => [goodPackage]) as any;

      const result = await run(() => service.complete(SO, ADMIN));

      expect(result.orderStatus).toBe('ready_for_dispatch');
      expect(result.totalWeightKg).toBe(3.2);
      expect(repository.completeSession).toHaveBeenCalledWith(
        TENANT, SESSION, SO, { weightKg: 3.2, packageCount: 1 },
      );
    });

    it('refuses while any line is short — the box would go out incomplete', async () => {
      repository.findSessionItems = jest.fn(async () => [
        { ...packedItems[0], packedQuantity: 7 },
      ]) as any;
      repository.findPackages = jest.fn(async () => [goodPackage]) as any;

      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/not fully packed/i);
      expect(repository.completeSession).not.toHaveBeenCalled();
    });

    it('refuses with no package at all', async () => {
      repository.findSessionItems = jest.fn(async () => packedItems) as any;
      repository.findPackages = jest.fn(async () => []) as any;

      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/at least one package/i);
    });

    it('refuses an unweighed box — the courier prices on that number', async () => {
      repository.findSessionItems = jest.fn(async () => packedItems) as any;
      repository.findPackages = jest.fn(async () => [{ ...goodPackage, weightKg: null }]) as any;

      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/no weight/i);
    });

    it('refuses a box with neither a master box nor dimensions', async () => {
      repository.findSessionItems = jest.fn(async () => packedItems) as any;
      repository.findPackages = jest.fn(async () => [
        { ...goodPackage, boxId: null, lengthCm: null, widthCm: null, heightCm: null },
      ]) as any;

      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/Select a box size/i);
    });

    it('refuses while an item belongs to no box', async () => {
      repository.findSessionItems = jest.fn(async () => [{ ...packedItems[0], packageId: null }]) as any;
      repository.findPackages = jest.fn(async () => [goodPackage]) as any;

      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/Assign every item/i);
    });

    it('refuses to complete an order that is already dispatched-ready', async () => {
      repository.findLiveSession = jest.fn(async () => session({ status: 'ready_for_dispatch' })) as any;
      await expect(run(() => service.complete(SO, ADMIN))).rejects.toThrow(/already packed/i);
    });
  });

  describe('shipping label', () => {
    it('needs a tracking number or a courier label', async () => {
      await expect(run(() => service.setLabel(SO, {}, ADMIN)))
        .rejects.toThrow(/tracking number/i);
    });

    it('records a manually entered tracking number as a manual label', async () => {
      await run(() => service.setLabel(SO, { carrier: 'Delhivery', trackingNumber: 'AWB1' }, ADMIN));
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION, TENANT, expect.objectContaining({ trackingNumber: 'AWB1', labelSource: 'manual' }),
      );
    });

    it('marks a courier-supplied PDF as such, so it is never regenerated locally', async () => {
      await run(() => service.setLabel(SO, { labelUrl: 'https://courier/label.pdf' }, ADMIN));
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION, TENANT, expect.objectContaining({ labelSource: 'courier' }),
      );
    });
  });
});
