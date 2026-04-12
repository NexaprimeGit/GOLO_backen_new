import {
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../common/constants/kafka-topics';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { ListMerchantProductsDto } from './dto/list-merchant-products.dto';
import {
  MerchantProduct,
  MerchantProductDocument,
} from './schemas/merchant-product.schema';

@Injectable()
export class MerchantProductsService {
  constructor(
    @InjectModel(MerchantProduct.name)
    private readonly merchantProductModel: Model<MerchantProductDocument>,
    @Optional() private readonly kafkaService?: KafkaService,
  ) {}

  private deriveStatus(stockQuantity: number):
    | 'In Stock'
    | 'Low Stock'
    | 'Out of Stock' {
    if (stockQuantity <= 0) return 'Out of Stock';
    if (stockQuantity <= 10) return 'Low Stock';
    return 'In Stock';
  }

  async create(merchantId: string, dto: CreateMerchantProductDto) {
    const payload = {
      merchantId,
      name: dto.name.trim(),
      category: dto.category.trim(),
      stockQuantity: dto.stockQuantity,
      price: dto.price,
      description: dto.description?.trim() || '',
      images: dto.images || [],
      status: this.deriveStatus(dto.stockQuantity),
    };

    const product = await this.merchantProductModel.create(payload);

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.MERCHANT_PRODUCT_CREATED, {
        merchantId,
        productId: String(product._id),
        name: product.name,
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
      });
    }

    return {
      success: true,
      message: 'Product created successfully',
      data: this.mapProduct(product),
    };
  }

  async listMyProducts(merchantId: string, query: ListMerchantProductsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<MerchantProductDocument> = { merchantId };

    if (query.search?.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { category: searchRegex }];
    }

    const [products, total, totalProducts, lowStockProducts, outOfStockProducts, inventoryAgg] =
      await Promise.all([
        this.merchantProductModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.merchantProductModel.countDocuments(filter),
        this.merchantProductModel.countDocuments({ merchantId }),
        this.merchantProductModel.countDocuments({
          merchantId,
          stockQuantity: { $gt: 0, $lte: 10 },
        }),
        this.merchantProductModel.countDocuments({ merchantId, stockQuantity: 0 }),
        this.merchantProductModel.aggregate([
          { $match: { merchantId } },
          {
            $group: {
              _id: null,
              total: {
                $sum: { $multiply: ['$price', '$stockQuantity'] },
              },
            },
          },
        ]),
      ]);

    const inventoryValue = inventoryAgg[0]?.total || 0;

    return {
      success: true,
      data: {
        products: products.map((product) => this.mapProduct(product)),
        stats: {
          totalProducts,
          inventoryValue,
          lowStockProducts,
          outOfStockProducts,
        },
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getProduct(merchantId: string, productId: string) {
    const product = await this.merchantProductModel.findById(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only view your own products');
    }

    return {
      success: true,
      data: this.mapProduct(product),
    };
  }

  async deleteProduct(merchantId: string, productId: string) {
    const product = await this.merchantProductModel.findById(productId).exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (String(product.merchantId) !== String(merchantId)) {
      throw new ForbiddenException('You can only delete your own products');
    }

    if (this.kafkaService) {
      await this.kafkaService.emit(KAFKA_TOPICS.MERCHANT_PRODUCT_DELETED, {
        merchantId,
        productId: String(product._id),
        name: product.name,
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
      });
    }

    await this.merchantProductModel.findByIdAndDelete(productId).exec();

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }

  private mapProduct(product: MerchantProductDocument) {
    return {
      id: String(product._id),
      name: product.name,
      category: product.category,
      description: product.description,
      stockQuantity: product.stockQuantity,
      stock: `${product.stockQuantity} units`,
      price: product.price,
      priceLabel: `₹${product.price}`,
      status: product.status,
      image: product.images?.[0] || null,
      images: product.images || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
