import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { StartGameDto, MakeMoveDto, CashoutDto } from './dto'

export interface GameSession {
  id: number
  user_id: number
  mines_count: number
  bet_amount: number
  current_multiplier: number
  field: string[][]
  revealed_cells: { x: number; y: number }[]
  mine_positions: { x: number; y: number }[]
  status: 'active' | 'completed' | 'failed'
  created_at: Date
  updated_at: Date
}

export interface MoveResult {
  success: boolean
  is_mine: boolean
  is_diamond: boolean
  multiplier: number
  field: string[][]
  message: string
}

export interface CashoutResult {
  success: boolean
  final_multiplier: number
  win_amount: number
  message: string
}

@Injectable()
export class MinesService {
  private gameSessions: Map<number, GameSession> = new Map()
  private nextSessionId = 1

  async startGame(
    userId: number,
    startGameDto: StartGameDto,
  ): Promise<GameSession> {
    // Валидация входных данных
    if (!startGameDto.inventory_skin_id && !startGameDto.bet_amount) {
      throw new BadRequestException(
        'Either inventory_skin_id or bet_amount must be provided',
      )
    }

    if (startGameDto.inventory_skin_id && startGameDto.bet_amount) {
      throw new BadRequestException(
        'Cannot use both inventory_skin_id and bet_amount',
      )
    }

    // Создаем новую игровую сессию
    const sessionId = this.nextSessionId++
    const minePositions = this.generateMinePositions(startGameDto.mines_count)

    const gameSession: GameSession = {
      id: sessionId,
      user_id: userId,
      mines_count: startGameDto.mines_count,
      bet_amount: startGameDto.bet_amount || 0,
      current_multiplier: 1.0,
      field: this.createEmptyField(),
      revealed_cells: [],
      mine_positions: minePositions,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    }

    this.gameSessions.set(sessionId, gameSession)

    return gameSession
  }

  async makeMove(
    userId: number,
    makeMoveDto: MakeMoveDto,
  ): Promise<MoveResult> {
    const session = this.gameSessions.get(makeMoveDto.game_session_id)

    if (!session) {
      throw new NotFoundException('Game session not found')
    }

    if (session.user_id !== userId) {
      throw new BadRequestException('Access denied to this game session')
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Game session is not active')
    }

    // Проверяем, что клетка еще не открыта
    const isAlreadyRevealed = session.revealed_cells.some(
      cell => cell.x === makeMoveDto.x && cell.y === makeMoveDto.y,
    )

    if (isAlreadyRevealed) {
      throw new BadRequestException('Cell already revealed')
    }

    // Проверяем, что координаты в пределах поля
    if (
      makeMoveDto.x < 0 ||
      makeMoveDto.x >= 5 ||
      makeMoveDto.y < 0 ||
      makeMoveDto.y >= 5
    ) {
      throw new BadRequestException('Invalid coordinates')
    }

    // Добавляем клетку к открытым
    session.revealed_cells.push({ x: makeMoveDto.x, y: makeMoveDto.y })

    // Проверяем, попал ли игрок на мину
    const isMine = session.mine_positions.some(
      mine => mine.x === makeMoveDto.x && mine.y === makeMoveDto.y,
    )

    if (isMine) {
      session.status = 'failed'
      session.updated_at = new Date()
      return {
        success: false,
        is_mine: true,
        is_diamond: false,
        multiplier: session.current_multiplier,
        field: this.updateFieldDisplay(session),
        message: 'Game over! You hit a mine!',
      }
    }

    // Если не мина, то алмаз - увеличиваем множитель
    session.current_multiplier = this.calculateNextMultiplier(
      session.current_multiplier,
    )
    session.updated_at = new Date()

    return {
      success: true,
      is_mine: false,
      is_diamond: true,
      multiplier: session.current_multiplier,
      field: this.updateFieldDisplay(session),
      message: 'Diamond found! Multiplier increased.',
    }
  }

  async cashout(
    userId: number,
    cashoutDto: CashoutDto,
  ): Promise<CashoutResult> {
    const session = this.gameSessions.get(cashoutDto.game_session_id)

    if (!session) {
      throw new NotFoundException('Game session not found')
    }

    if (session.user_id !== userId) {
      throw new BadRequestException('Access denied to this game session')
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Game session is not active')
    }

    // Завершаем игру
    session.status = 'completed'
    session.updated_at = new Date()

    const winAmount = Math.floor(
      session.bet_amount * session.current_multiplier,
    )

    return {
      success: true,
      final_multiplier: session.current_multiplier,
      win_amount: winAmount,
      message: 'Cashout successful!',
    }
  }

  async getGameSession(
    userId: number,
    sessionId: number,
  ): Promise<GameSession> {
    const session = this.gameSessions.get(sessionId)

    if (!session) {
      throw new NotFoundException('Game session not found')
    }

    if (session.user_id !== userId) {
      throw new BadRequestException('Access denied to this game session')
    }

    return session
  }

  async getGameHistory(userId: number): Promise<GameSession[]> {
    const userSessions = Array.from(this.gameSessions.values())
      .filter(session => session.user_id === userId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())

    return userSessions
  }

  private generateMinePositions(
    minesCount: number,
  ): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = []
    const totalCells = 25 // 5x5 field

    // Генерируем случайные позиции для мин
    while (positions.length < minesCount) {
      const x = Math.floor(Math.random() * 5)
      const y = Math.floor(Math.random() * 5)

      // Проверяем, что позиция еще не занята
      if (!positions.some(pos => pos.x === x && pos.y === y)) {
        positions.push({ x, y })
      }
    }

    return positions
  }

  private createEmptyField(): string[][] {
    return Array(5)
      .fill(null)
      .map(() => Array(5).fill('?'))
  }

  private updateFieldDisplay(session: GameSession): string[][] {
    const field = this.createEmptyField()

    // Показываем открытые клетки
    session.revealed_cells.forEach(cell => {
      field[cell.y][cell.x] = '💎' // Diamond emoji
    })

    // Если игра завершена, показываем мины
    if (session.status === 'failed') {
      session.mine_positions.forEach(mine => {
        field[mine.y][mine.x] = '💣' // Bomb emoji
      })
    }

    return field
  }

  private calculateNextMultiplier(currentMultiplier: number): number {
    // Простая формула увеличения множителя
    // Можно сделать более сложную логику
    return Math.round((currentMultiplier + 0.15) * 100) / 100
  }
}

