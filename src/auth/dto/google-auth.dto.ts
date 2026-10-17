import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6I...google-id-token...',
    description:
      'Google Identity Services ID token returned by the frontend. The backend verifies its signature, issuer and audience before creating a session.',
  })
  @IsString()
  @MinLength(20)
  idToken!: string;

  @ApiPropertyOptional({ example: 'MOBILE', enum: ['WEB', 'MOBILE'] })
  @IsOptional()
  @IsIn(['WEB', 'MOBILE'])
  clientType?: 'WEB' | 'MOBILE';
}
