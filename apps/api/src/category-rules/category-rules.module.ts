import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoryRulesController } from './category-rules.controller';
import { CategoryRulesService } from './category-rules.service';

@Module({
  imports: [AuthModule],
  controllers: [CategoryRulesController],
  providers: [CategoryRulesService],
  exports: [CategoryRulesService],
})
export class CategoryRulesModule {}
