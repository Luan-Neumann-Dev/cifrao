import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { OnboardingService } from './onboarding.service';
import { NotificationsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController, NotificationsController],
  providers: [SettingsService, NotificationsService, OnboardingService],
  exports: [SettingsService, NotificationsService, OnboardingService],
})
export class SettingsModule {}
