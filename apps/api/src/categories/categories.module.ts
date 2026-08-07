import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategorySuggestionService } from './category-suggestion.service';

@Module({
  imports: [AuthModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategorySuggestionService],
})
export class CategoriesModule {}
