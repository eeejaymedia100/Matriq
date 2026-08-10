import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AssociationsService } from "./associations.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("v1")
export class AssociationsController {
  constructor(private readonly associationsService: AssociationsService) {}

  @Get("associations")
  list(@Query("cursor") cursor?: string, @Query("take") take?: string) {
    return this.associationsService.list(
      cursor,
      take ? Math.min(Number(take), 50) : undefined,
    );
  }

  @Get("associations/:id")
  getById(@Param("id") id: string) {
    return this.associationsService.getById(id);
  }

  @Get("associations/:id/fees")
  @UseGuards(JwtAuthGuard)
  getFees(@Param("id") id: string) {
    return this.associationsService.getFees(id);
  }
}
