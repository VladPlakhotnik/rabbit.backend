// src/skins/skin.service.ts

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Skin } from './skin.entity'

@Injectable()
export class SkinService {
  constructor(
    @InjectRepository(Skin)
    private readonly skinRepository: Repository<Skin>,
  ) {}

  // Метод для получения всех скинов
  async getAllSkins(): Promise<Skin[]> {
    return await this.skinRepository.find() // Выполняем запрос ко всем скинам
  }
}
