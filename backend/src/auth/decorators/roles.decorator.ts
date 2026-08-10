import { SetMetadata } from "@nestjs/common";

// Roles supported by the RBAC system.
// 'student' covers any authenticated user with a student account.
// Executive roles mirror the ExecutiveRole enum in the Prisma schema.
export type AppRole = "student" | "president" | "treasurer" | "pro" | "admin";

export const ROLES_KEY = "roles";
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
