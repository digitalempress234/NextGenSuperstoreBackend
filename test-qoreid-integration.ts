import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { QoreIDService } from './src/qoreid/qoreid.service';
import { RedisService } from './src/redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const qoreidService = app.get(QoreIDService);
  const redisService = app.get(RedisService);
  
  // Clear any cached token first
  await redisService.del('qoreid:bearer_token');
  
  try {
    console.log('Fetching QoreID token...');
    const token = await qoreidService.getToken();
    console.log('✅ Success! Token retrieved (first 20 chars):', token.substring(0, 20) + '...');
    
    // You could also run a mock verification here if you wanted
    // e.g., await qoreidService.verifyCac('RC1234');
  } catch (error) {
    console.error('❌ Failed to fetch token:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
