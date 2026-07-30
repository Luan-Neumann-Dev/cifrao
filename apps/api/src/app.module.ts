import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';

@Module({
  imports: [HealthModule, MeModule],
})
export class AppModule {}
