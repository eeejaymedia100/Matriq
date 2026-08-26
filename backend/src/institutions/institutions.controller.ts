import { Controller, Get, Param } from "@nestjs/common";
import { InstitutionsService } from "./institutions.service";

@Controller("v1")
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  // ── Public (mobile dropdowns) ──────────────────────────────────

  @Get("institutions")
  list() {
    return this.institutionsService.list();
  }

  @Get("institutions/:id/faculties")
  faculties(@Param("id") id: string) {
    return this.institutionsService.faculties(id);
  }

  @Get("faculties/:id/departments")
  departments(@Param("id") id: string) {
    return this.institutionsService.departments(id);
  }

  @Get("institutions/cascade")
  fullCascade() {
    return this.institutionsService.fullCascade();
  }
}
