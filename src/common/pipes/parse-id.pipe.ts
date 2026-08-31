import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('ID must be a positive integer.');
    }

    return id;
  }
}
