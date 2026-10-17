import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PasskeyRegistrationOptionsDto {
  @ApiPropertyOptional({ example: 'My phone', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class VerifyPasskeyRegistrationDto extends PasskeyRegistrationOptionsDto {
  @ApiProperty({ description: 'WebAuthn registration response returned by the platform.' })
  @IsObject()
  response!: Record<string, unknown>;
}

export class PasskeyLoginOptionsDto {}

export class VerifyPasskeyLoginDto {
  @ApiProperty({ description: 'Challenge returned by the login options endpoint.' })
  @IsString()
  challenge!: string;

  @ApiProperty({ description: 'WebAuthn authentication response returned by the platform.' })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'MOBILE', enum: ['WEB', 'MOBILE'] })
  @IsOptional()
  @IsIn(['WEB', 'MOBILE'])
  clientType?: 'WEB' | 'MOBILE';
}
