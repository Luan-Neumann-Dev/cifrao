import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';

/** Rota protegida de exemplo: prova que o guard valida o JWT do Better Auth. */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: AuthUser | undefined): { user: AuthUser | undefined } {
    return { user };
  }
}
