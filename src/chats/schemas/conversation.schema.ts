import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ required: true })
  adId: string;

  @Prop({ type: [String], required: true })
  participants: string[];

  @Prop({ required: true })
  participantKey: string;

  @Prop()
  lastMessageText?: string;

  @Prop({ default: Date.now })
  lastMessageAt: Date;

  @Prop({ default: 0 })
  messagesCount: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ participants: 1, lastMessageAt: -1 });
ConversationSchema.index({ adId: 1, participantKey: 1 }, { unique: true });
