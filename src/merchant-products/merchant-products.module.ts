import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import {
  MerchantProduct,
  MerchantProductSchema,
} from './schemas/merchant-product.schema';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantProductsService } from './merchant-products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MerchantProduct.name, schema: MerchantProductSchema },
    ]),
    KafkaModule,
  ],
  controllers: [MerchantProductsController],
  providers: [MerchantProductsService],
  exports: [MerchantProductsService],
})
export class MerchantProductsModule {}
