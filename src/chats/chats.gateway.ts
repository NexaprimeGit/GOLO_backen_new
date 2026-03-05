import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatsService } from './chats.service';

@WebSocketGateway({
	namespace: '/chat',
	cors: {
		origin: true,
		credentials: true,
	},
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private readonly logger = new Logger(ChatsGateway.name);

	constructor(
		private jwtService: JwtService,
		private configService: ConfigService,
		private chatsService: ChatsService,
	) {}

	async handleConnection(client: Socket) {
		try {
			const tokenFromAuth = client.handshake.auth?.token;
			const tokenFromHeader = client.handshake.headers.authorization?.replace('Bearer ', '');
			const token = tokenFromAuth || tokenFromHeader;

			if (!token) {
				throw new WsException('Authentication token is required');
			}

			const payload = this.jwtService.verify(token, {
				secret: this.configService.get<string>('JWT_SECRET'),
			});

			if (!payload?.sub) {
				throw new WsException('Invalid token payload');
			}

			const userId = String(payload.sub);
			client.data.userId = userId;
			client.join(`user:${userId}`);

			this.logger.debug(`Socket connected for user ${userId}: ${client.id}`);
		} catch (error) {
			this.logger.warn(`Socket auth failed: ${error.message}`);
			client.emit('chat_error', { message: 'Authentication failed' });
			client.disconnect();
		}
	}

	handleDisconnect(client: Socket) {
		this.logger.debug(`Socket disconnected: ${client.id}`);
	}

	@SubscribeMessage('join_conversation')
	async joinConversation(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { conversationId: string },
	) {
		try {
			const userId = client.data.userId as string;
			if (!userId) {
				throw new WsException('Unauthorized');
			}

			const conversation = await this.chatsService.getConversationForUser(userId, payload.conversationId);
			const room = `conversation:${conversation._id.toString()}`;
			client.join(room);

			return {
				success: true,
				room,
			};
		} catch (error) {
			throw new WsException(error.message || 'Failed to join conversation');
		}
	}

	@SubscribeMessage('leave_conversation')
	async leaveConversation(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { conversationId: string },
	) {
		const room = `conversation:${payload.conversationId}`;
		client.leave(room);
		return { success: true };
	}

	@SubscribeMessage('send_message')
	async sendMessage(
		@ConnectedSocket() client: Socket,
		@MessageBody() payload: { conversationId: string; text: string },
	) {
		try {
			const userId = client.data.userId as string;
			if (!userId) {
				throw new WsException('Unauthorized');
			}

			const message = await this.chatsService.sendMessage(userId, payload.conversationId, {
				text: payload.text,
			});

			const room = `conversation:${payload.conversationId}`;
			this.server.to(room).emit('new_message', message);

			return {
				success: true,
				data: message,
			};
		} catch (error) {
			throw new WsException(error.message || 'Failed to send message');
		}
	}
}
