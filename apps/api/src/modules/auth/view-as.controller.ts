import { BadRequestException, Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { StartViewAsRequestSchema } from '@cyris/contracts';
import { AuthGuard, type CyrisRequest } from './guards/auth.guard.js';
import { ViewAsService } from './view-as.service.js';

@Controller('auth/view-as')
@UseGuards(AuthGuard)
export class ViewAsController {
  constructor(private readonly previews: ViewAsService) {}

  @Post()
  async start(@Body() body: unknown, @Req() req: CyrisRequest) {
    const input = StartViewAsRequestSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('A valid exercise and participant are required');
    return this.previews.start(req.user!, req.sessionToken!, input.data, req.id);
  }

  @Delete()
  async stop(@Req() req: CyrisRequest) {
    const id = req.headers['x-cyris-view-as'];
    if (typeof id !== 'string') throw new BadRequestException('Preview identifier required');
    await this.previews.stop(id, req.user!, req.sessionToken!, req.id);
    return { success: true };
  }
}
