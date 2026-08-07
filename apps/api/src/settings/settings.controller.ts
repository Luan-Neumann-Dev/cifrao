import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type RequiredMonthInput,
  type UpdateNotificationPrefsInput,
  type UpdateProfileInput,
  requiredMonthSchema,
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
import { OnboardingService } from './onboarding.service';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.service.profile(user.id);
  }

  /** Primeiros passos pendentes e retrospectiva a oferecer. */
  @Get('onboarding')
  onboardingStatus(@CurrentUser() user: AuthUser) {
    return this.onboarding.status(user.id);
  }

  @Post('onboarding/concluir')
  finishOnboarding(@CurrentUser() user: AuthUser) {
    return this.onboarding.finishOnboarding(user.id);
  }

  /** Marca a retrospectiva do mês como vista, para o aviso sumir do painel. */
  @Post('revisao-vista')
  markReviewSeen(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(requiredMonthSchema)) dto: RequiredMonthInput,
  ) {
    return this.onboarding.markReviewSeen(user.id, dto.month);
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
