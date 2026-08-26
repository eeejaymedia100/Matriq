import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List all institutions (dropdown source). */
  async list() {
    const institutions = await this.prisma.institution.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        shortName: true,
        type: true,
        state: true,
      },
    });
    return { institutions };
  }

  /** List faculties for an institution. */
  async faculties(institutionId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) throw new NotFoundException("Institution not found");

    const faculties = await this.prisma.faculty.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return {
      institution: { id: institution.id, name: institution.name },
      faculties,
    };
  }

  /** List departments for a faculty. */
  async departments(facultyId: string) {
    const faculty = await this.prisma.faculty.findUnique({
      where: { id: facultyId },
      include: { institution: { select: { id: true, name: true } } },
    });
    if (!faculty) throw new NotFoundException("Faculty not found");

    const departments = await this.prisma.department.findMany({
      where: { facultyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return { faculty: { id: faculty.id, name: faculty.name }, departments };
  }

  /** Full cascade: all institutions with their faculties and departments. */
  async fullCascade() {
    const institutions = await this.prisma.institution.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        shortName: true,
        faculties: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            departments: {
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    return { institutions };
  }

  // ── Admin management ──────────────────────────────────────────

  /** Create an institution (admin). */
  async create(dto: {
    name: string;
    shortName?: string;
    type?: string;
    state?: string;
  }) {
    const institution = await this.prisma.institution.create({
      data: {
        name: dto.name,
        shortName: dto.shortName,
        type: (dto.type as never) ?? "university",
        state: dto.state,
      },
    });
    this.logger.log(`Institution created: ${institution.name}`);
    return { id: institution.id, name: institution.name };
  }

  /** Add a faculty to an institution (admin). */
  async addFaculty(institutionId: string, name: string) {
    const faculty = await this.prisma.faculty.create({
      data: { institutionId, name },
    });
    return {
      id: faculty.id,
      name: faculty.name,
      institutionId: faculty.institutionId,
    };
  }

  /** Add a department to a faculty (admin). */
  async addDepartment(facultyId: string, name: string) {
    const department = await this.prisma.department.create({
      data: { facultyId, name },
    });
    return {
      id: department.id,
      name: department.name,
      facultyId: department.facultyId,
    };
  }

  /** Remove institution (admin). */
  async remove(id: string) {
    await this.prisma.institution.delete({ where: { id } });
    this.logger.log(`Institution removed: ${id}`);
    return { message: "Institution removed" };
  }

  /** Remove faculty (admin). */
  async removeFaculty(id: string) {
    await this.prisma.faculty.delete({ where: { id } });
    return { message: "Faculty removed" };
  }

  /** Remove department (admin). */
  async removeDepartment(id: string) {
    await this.prisma.department.delete({ where: { id } });
    return { message: "Department removed" };
  }
}
