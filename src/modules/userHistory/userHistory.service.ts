import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserHistory } from './userHistory.entity'
import { CaseHistory } from './entities/case-history.entity'
import { UpgradeHistory } from './entities/upgrade-history.entity'

@Injectable()
export class UserHistoryService {
  constructor(
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
    @InjectRepository(CaseHistory)
    private readonly caseHistoryRepository: Repository<CaseHistory>,
    @InjectRepository(UpgradeHistory)
    private readonly upgradeHistoryRepository: Repository<UpgradeHistory>,
  ) {}

  async addHistory(
    userId: number,
    action: string,
    relatedTable?: string,
    relatedId?: number,
  ) {
    const history = this.userHistoryRepository.create({
      user_id: userId,
      action,
      related_table: relatedTable,
      related_id: relatedId,
    })
    return this.userHistoryRepository.save(history)
  }

  async openCase(
    userId: number,
    caseId: number,
    caseName: string,
    casePrice: number,
    caseImg?: string,
    serverSeed?: string,
    skinId?: number,
    skinImg?: string,
    skinPrice?: number,
  ) {
    // Сохраняем детальную информацию в case_history
    const caseHistory = this.caseHistoryRepository.create({
      user_id: userId,
      case_id: caseId,
      case_name: caseName,
      case_price: casePrice,
      case_img: caseImg,
      server_seed: serverSeed,
      skin_id: skinId,
      skin_img: skinImg,
      skin_price: skinPrice,
    })
    const savedCaseHistory = await this.caseHistoryRepository.save(caseHistory)

    // Добавляем запись в общую историю с generic FK
    await this.addHistory(
      userId,
      'open_case',
      'case_history',
      savedCaseHistory.id,
    )

    return savedCaseHistory
  }

  async upgradeSkin(
    userId: number,
    skinId: number,
    skinName: string,
    oldRarity: string,
    newRarity: string,
    cost: number,
  ) {
    // Сохраняем детальную информацию в upgrade_history
    const upgradeHistory = this.upgradeHistoryRepository.create({
      user_id: userId,
      skin_id: skinId,
      skin_name: skinName,
      old_rarity: oldRarity,
      new_rarity: newRarity,
      cost,
    })
    const savedUpgradeHistory = await this.upgradeHistoryRepository.save(
      upgradeHistory,
    )

    // Добавляем запись в общую историю с generic FK
    await this.addHistory(
      userId,
      'upgrade_skin',
      'upgrade_history',
      savedUpgradeHistory.id,
    )

    return savedUpgradeHistory
  }

  async getUserHistory(userId: number) {
    return this.userHistoryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
  }

  async getCaseHistory(userId: number) {
    return this.caseHistoryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
  }

  async getUpgradeHistory(userId: number) {
    return this.upgradeHistoryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
  }

  // Метод для получения детальной информации по generic FK
  async getHistoryWithDetails(userId: number) {
    const history = await this.getUserHistory(userId)

    const detailedHistory = await Promise.all(
      history.map(async record => {
        if (record.related_table && record.related_id) {
          let details = null

          switch (record.related_table) {
            case 'case_history':
              details = await this.caseHistoryRepository.findOne({
                where: { id: record.related_id },
              })
              break
            case 'upgrade_history':
              details = await this.upgradeHistoryRepository.findOne({
                where: { id: record.related_id },
              })
              break
          }

          return { ...record, details }
        }
        return record
      }),
    )

    return detailedHistory
  }

  // Метод для фильтрованной истории
  async getFilteredHistory(
    userId: number,
    filters: {
      action?: string
      relatedTable?: string
      limit?: number
    },
  ) {
    const query = this.userHistoryRepository.createQueryBuilder('history')
    query.where('history.user_id = :userId', { userId })

    if (filters.action) {
      query.andWhere('history.action = :action', { action: filters.action })
    }

    if (filters.relatedTable) {
      query.andWhere('history.related_table = :relatedTable', {
        relatedTable: filters.relatedTable,
      })
    }

    query.orderBy('history.created_at', 'DESC')

    if (filters.limit) {
      query.limit(filters.limit)
    }

    return query.getMany()
  }

  // Метод для статистики по играм
  async getGameStats(userId: number) {
    const stats = await this.userHistoryRepository
      .createQueryBuilder('history')
      .select('history.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('history.user_id = :userId', { userId })
      .groupBy('history.action')
      .getRawMany()

    const caseStats = await this.caseHistoryRepository
      .createQueryBuilder('case')
      .select('COUNT(*)', 'totalCases')
      .addSelect('SUM(case.case_price)', 'totalSpent')
      .addSelect('SUM(case.skin_price)', 'totalWon')
      .where('case.user_id = :userId', { userId })
      .getRawOne()

    const upgradeStats = await this.upgradeHistoryRepository
      .createQueryBuilder('upgrade')
      .select('COUNT(*)', 'totalUpgrades')
      .addSelect('SUM(upgrade.cost)', 'totalCost')
      .where('upgrade.user_id = :userId', { userId })
      .getRawOne()

    return {
      actionStats: stats,
      caseStats,
      upgradeStats,
    }
  }
}
