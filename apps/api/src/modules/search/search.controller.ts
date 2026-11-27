import { Controller, Get, Query, UseGuards, BadRequestException, Header } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { SearchQueryFiltersSchema, type SearchResponse } from '@cyris/contracts';
import { SearchService } from './search.service.js';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async search(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<SearchResponse> {
    const parsed = SearchQueryFiltersSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.errors[0]?.message ?? 'Invalid search query parameters'
      );
    }

    return this.searchService.search(parsed.data, user);
  }
}
