import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { HealthResponse, ReadinessResponse } from '@cyris/contracts';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getLiveness(): HealthResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: FastifyReply): Promise<ReadinessResponse> {
    const { response, isHealthy } = await this.healthService.getReadiness();
    if (!isHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }
}
