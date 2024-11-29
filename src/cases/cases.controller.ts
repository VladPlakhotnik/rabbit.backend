import { Controller, Get, Param, NotFoundException } from "@nestjs/common";
import { CaseService } from "./cases.service";

@Controller("cases")
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  // Маршрут для получения всех кейсов
  @Get()
  async findAll() {
    return this.caseService.findAll();
  }

  // Маршрут для получения кейса по ID
  @Get(":id")
  async findOne(@Param("id") id: number) {
    const caseItem = await this.caseService.findOne(id);
    if (!caseItem) {
      throw new NotFoundException("Case not found");
    }
    return caseItem;
  }
}
