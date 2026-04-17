import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, unique: true, index: true })
  productId: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  regularPrice: number;

  @Prop()
  discountPrice?: number;

  @Prop({ required: true, min: 0 })
  stockQuantity: number;

  @Prop({ type: [String], default: [] })
  productImages: string[];

  @Prop()
  brandImage?: string;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'discontinued'] })
  status: string;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  purchases: number;

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  reviewCount: number;

  @Prop()
  sku?: string;

  @Prop()
  barcode?: string;

  @Prop()
  weight?: number; // in kg

  @Prop()
  dimensions?: string; // L x W x H

  @Prop({ default: true })
  isVisible: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ merchantId: 1, createdAt: -1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ status: 1, isVisible: 1 });
ProductSchema.index({ merchantId: 1, status: 1 });
