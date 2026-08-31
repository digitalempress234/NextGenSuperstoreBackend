import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6I...google-id-token...',
    description:
      'Google Identity Services ID token returned by the frontend. The backend verifies its signature, issuer and audience before creating a session.',
  })
  @IsString()
  @MinLength(20)
  idToken!: string;
}
