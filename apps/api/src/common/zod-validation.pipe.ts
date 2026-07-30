import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valida a entrada com um schema Zod compartilhado (fonte única de tipos). Em
 * caso de erro, devolve 400 com as issues do Zod.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
