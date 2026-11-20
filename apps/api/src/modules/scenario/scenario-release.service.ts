import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { releaseScenarioInject, ScenarioRuntimeError, type ScenarioReleaseResult } from '@cyris/db';
import { DatabaseService } from '../database/database.service.js';

export type ReleaseExecutionResult = ScenarioReleaseResult;

export function rethrowScenarioError(error: unknown): never {
  if (error instanceof ScenarioRuntimeError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'FORBIDDEN') throw new ForbiddenException(error.message);
    if (error.code === 'INVALID') throw new BadRequestException(error.message);
    throw new ConflictException(error.message);
  }
  throw error;
}

@Injectable()
export class ScenarioReleaseService {
  constructor(private readonly databaseService: DatabaseService) {}

  async executeRelease(eventId: string, injectId: string, releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE' = 'MANUAL', userId?: string, overrideReason?: string, allowPlatformConditions = false): Promise<ReleaseExecutionResult> {
    try {
      return await releaseScenarioInject(this.databaseService.client, eventId, injectId, releaseType, userId, overrideReason, allowPlatformConditions);
    } catch (error) { rethrowScenarioError(error); }
  }
}
