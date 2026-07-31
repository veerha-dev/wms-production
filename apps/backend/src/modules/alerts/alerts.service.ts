import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertsRepository } from './alerts.repository';
import { CreateAlertDto, QueryAlertDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';




@Injectable()
export class AlertsService {
  constructor(private repository: AlertsRepository) {}


  async findAll(query: QueryAlertDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const alert = await this.repository.findById(getCurrentTenantId(), id);
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async create(dto: CreateAlertDto) {
    return this.repository.create(getCurrentTenantId(), dto);
  }

  async acknowledge(id: string, acknowledgedBy: string) {
    await this.findById(id);
    return this.repository.acknowledge(getCurrentTenantId(), id, acknowledgedBy);
  }

  async acknowledgeAll(acknowledgedBy: string) {
    const count = await this.repository.acknowledgeAll(getCurrentTenantId(), acknowledgedBy);
    return { acknowledged: count };
  }

  async getSummary() {
    return this.repository.getSummary(getCurrentTenantId());
  }
}
