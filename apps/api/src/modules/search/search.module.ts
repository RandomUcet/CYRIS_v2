import { Global, Module } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { SearchAuthzService } from './search-authz.service.js';
import { SearchIndexerService } from './search-indexer.service.js';
import { SearchController } from './search.controller.js';

@Global()
@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchAuthzService, SearchIndexerService],
  exports: [SearchService, SearchAuthzService, SearchIndexerService],
})
export class SearchModule {}
