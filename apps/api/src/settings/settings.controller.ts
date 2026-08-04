import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import {
  type UpdateNotificationPrefsInput,
  type UpdateProfileInput,
  updateNotificationPrefsSchema,
  updateProfileSchema,
} from '@cifrao/shared';
import type { Request } from 'express';
import { sessionTokenFromCookie } from '../auth/cookie';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.service.profile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileInput,
  ) {
    return this.service.updateProfile(user.id, dto);
  }

  @Patch('notifications')
  updateNotifications(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateNotificationPrefsSchema)) dto: UpdateNotificationPrefsInput,
  ) {
    return this.service.updateNotifications(user.id, dto);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.sessions(user.id, sessionTokenFromCookie(req.headers.cookie));
  }

  @Delete('sessions/outras')
  revokeOthers(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.revokeOtherSessions(user.id, sessionTokenFromCookie(req.headers.cookie));
  }

  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.revokeSession(user.id, id);
  }
}

/** Sino do topo. Rota separada porque não é configuração — é o painel usando. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }
}
