import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * `GET /api/v1/dashboard/manager-stats` used to demand an explicit
 * `warehouseId` even though a manager's warehouse is already on their JWT, and
 * it never checked that the requested warehouse was actually theirs — a
 * manager could read another warehouse's headcount, stock and orders simply by
 * changing the query string. Both behaviours are pinned here.
 */

const HYD = '11111111-1111-1111-1111-111111111111';
const MAA = '22222222-2222-2222-2222-222222222222';

describe('DashboardController — manager-stats scoping', () => {
  let controller: DashboardController;
  let service: { getManagerStats: jest.Mock };

  beforeEach(() => {
    service = { getManagerStats: jest.fn(async (id: string) => ({ warehouse: { id } })) };
    controller = new DashboardController(service as unknown as DashboardService);
  });

  const req = (user: any) => ({ user });

  // ─────────────────────────────────────────────── warehouse defaulting ─

  it('falls back to the warehouse on the manager JWT when no query param is given', async () => {
    const res = await controller.getManagerStats(req({ role: 'manager', warehouseId: HYD }));

    expect(service.getManagerStats).toHaveBeenCalledWith(HYD);
    expect(res.success).toBe(true);
  });

  it('accepts an explicit warehouseId that matches the manager JWT', async () => {
    await controller.getManagerStats(req({ role: 'manager', warehouseId: HYD }), HYD);

    expect(service.getManagerStats).toHaveBeenCalledWith(HYD);
  });

  it('falls back to the warehouse on an admin JWT when no query param is given', async () => {
    await controller.getManagerStats(req({ role: 'admin', warehouseId: MAA }));

    expect(service.getManagerStats).toHaveBeenCalledWith(MAA);
  });

  it('prefers the explicit warehouseId for an admin, who is not pinned to one warehouse', async () => {
    await controller.getManagerStats(req({ role: 'admin', warehouseId: HYD }), MAA);

    expect(service.getManagerStats).toHaveBeenCalledWith(MAA);
  });

  it('still 400s when neither a query param nor a warehouse on the token exists', async () => {
    await expect(
      controller.getManagerStats(req({ role: 'admin', warehouseId: null })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.getManagerStats).not.toHaveBeenCalled();
  });

  it('400s for a manager with no warehouse assignment rather than leaking a default', async () => {
    await expect(
      controller.getManagerStats(req({ role: 'manager', warehouseId: null }), HYD),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.getManagerStats).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────── cross-warehouse data leak ─

  it("refuses a manager asking for another warehouse's stats", async () => {
    await expect(
      controller.getManagerStats(req({ role: 'manager', warehouseId: HYD }), MAA),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.getManagerStats).not.toHaveBeenCalled();
  });

  it('does not fall back to the requested warehouse when the manager check rejects it', async () => {
    await expect(
      controller.getManagerStats(req({ role: 'manager', warehouseId: HYD }), MAA),
    ).rejects.toThrow(/assigned warehouse/i);
  });

  it('tolerates a request with no user attached by requiring an explicit warehouseId', async () => {
    await expect(controller.getManagerStats({} as any)).rejects.toBeInstanceOf(BadRequestException);

    await controller.getManagerStats({} as any, HYD);
    expect(service.getManagerStats).toHaveBeenCalledWith(HYD);
  });
});
