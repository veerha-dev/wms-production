import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomersRepository } from './customers.repository';
import { CustomerAddressesRepository } from './customer-addresses.repository';

// DocumentNumberingModule is @Global, so DocumentNumberingService is injectable
// here without an explicit import.
@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository, CustomerAddressesRepository],
  exports: [CustomersService, CustomersRepository, CustomerAddressesRepository],
})
export class CustomersModule {}
