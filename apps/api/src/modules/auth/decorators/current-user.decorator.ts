import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CyrisRequest } from '../guards/auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<CyrisRequest>();
    return req.user;
  }
);
