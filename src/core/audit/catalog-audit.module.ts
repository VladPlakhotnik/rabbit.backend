import { Global, Module } from '@nestjs/common'
import { CatalogAuditService } from './catalog-audit.service'

@Global()
@Module({
  providers: [CatalogAuditService],
  exports: [CatalogAuditService],
})
export class CatalogAuditModule {}
