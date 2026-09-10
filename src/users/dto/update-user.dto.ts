import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'MALE', enum: ['MALE', 'FEMALE'] })
  @IsOptional()
  @IsString()
  @IsIn(['MALE', 'FEMALE'])
  gender?: string;

  @ApiPropertyOptional({ example: '1995-06-15', description: 'ISO 8601 date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
