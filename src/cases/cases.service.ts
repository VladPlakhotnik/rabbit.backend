import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Case } from "./cases.entity";

@Injectable()
export class CaseService {
  constructor(
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>
  ) {}

  // Метод для получения всех кейсов
  async findAll(): Promise<Case[]> {
    return this.caseRepository.find();
  }

  // Метод для получения кейса по ID
  async findOne(id: number): Promise<Case | null> {
    return this.caseRepository.findOne({ where: { id } });
  }
}
