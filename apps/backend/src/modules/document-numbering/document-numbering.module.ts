import { Global, Module } from '@nestjs/common';
import { DocumentNumberingService } from './document-numbering.service';

/**
 * Global so any module can inject DocumentNumberingService without importing
 * this module explicitly — document numbers are needed across nearly every
 * transactional module.
 */
@Global()
@Module({
  providers: [DocumentNumberingService],
  exports: [DocumentNumberingService],
})
export class DocumentNumberingModule {}
