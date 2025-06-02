import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { ClickerUserService } from './clicker-user.service'
import { ClickDto } from './dto/click.dto'
import { UseGuards } from '@nestjs/common'
import { EVENTS, GATEWAY_CONFIG } from './constants/events'
import { UserUpdatePayload, ErrorResponse } from './types/user-update.types'

@WebSocketGateway(GATEWAY_CONFIG)
export class ClickerUserGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server

  constructor(private readonly clickerUserService: ClickerUserService) {}

  afterInit(): void {}

  handleConnection(): void {}

  handleDisconnect(): void {}

  @SubscribeMessage(EVENTS.CLICK)
  async handleClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() clickDto: ClickDto,
  ): Promise<void> {
    try {
      const result = await this.clickerUserService.handleClick(clickDto)
      const updatePayload: UserUpdatePayload = {
        userId: clickDto.user_id,
        clicks: result.points,
        energy: result.energy_amount,
        level: result.level?.id ?? null,
        clickLevel: result.click_level?.id ?? null,
        energyLevel: result.energy_level?.id ?? null,
      }

      client.emit(EVENTS.CLICK_RESULT, updatePayload)
      this.server.emit(EVENTS.USER_UPDATE, updatePayload)
    } catch (error: any) {
      this.handleError(client, error)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_CLICK)
  async handleUpgradeClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: number,
  ): Promise<void> {
    try {
      const result = await this.clickerUserService.upgradeClickLevel(userId)
      const updatePayload: UserUpdatePayload = {
        userId,
        clicks: result.points,
        clickLevel: result.click_level?.id ?? null,
      }

      client.emit(EVENTS.UPGRADE_CLICK_RESULT, updatePayload)
      this.server.emit(EVENTS.USER_UPDATE, updatePayload)
    } catch (error: any) {
      this.handleError(client, error)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_ENERGY)
  async handleUpgradeEnergy(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: number,
  ): Promise<void> {
    try {
      const result = await this.clickerUserService.upgradeEnergyLevel(userId)
      const updatePayload: UserUpdatePayload = {
        userId,
        clicks: result.points,
        energy: result.energy_amount,
        energyLevel: result.energy_level?.level ?? null,
      }

      client.emit(EVENTS.UPGRADE_ENERGY_RESULT, updatePayload)
      this.server.emit(EVENTS.USER_UPDATE, updatePayload)
    } catch (error: any) {
      this.handleError(client, error)
    }
  }

  @SubscribeMessage(EVENTS.GET_ENERGY_INFO)
  async handleGetEnergyInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: number,
  ): Promise<void> {
    try {
      const energyInfo =
        await this.clickerUserService.getEnergyRegenerationInfo(userId)
      console.log('Energy info:', energyInfo)

      // Отправляем информацию об энергии клиенту
      client.emit(EVENTS.ENERGY_INFO, energyInfo)

      /* Закомментированная логика обновления пользователя
      // Получаем актуальные данные пользователя
      const user = await this.clickerUserService.findByUserId(userId)
      const updatePayload: UserUpdatePayload = {
        userId,
        clicks: user.points,
        energy: user.energy_amount,
        level: user.level?.id ?? null,
        clickLevel: user.click_level?.id ?? null,
        energyLevel: user.energy_level?.id ?? null,
      }

      // Отправляем обновление пользователя
      client.emit(EVENTS.USER_UPDATE, updatePayload)
      this.server.emit(EVENTS.USER_UPDATE, updatePayload)
      */
    } catch (error: any) {
      console.error('Error in handleGetEnergyInfo:', error)
      this.handleError(client, error)
    }
  }

  private handleError(client: Socket, error: Error): void {
    const errorResponse: ErrorResponse = {
      message: error.message,
    }
    client.emit(EVENTS.ERROR, errorResponse)
  }
}
