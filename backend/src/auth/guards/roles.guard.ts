import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY, AppRole } from "../decorators/roles.decorator";
import { JwtPayload } from "../auth.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const payload = user as JwtPayload;

    if (!payload) {
      return false;
    }

    // 'student' matches any authenticated user
    if (requiredRoles.includes("student")) {
      return true;
    }

    // Executive roles: check if the user holds any of the required roles
    // in their executive assignments
    if (payload.executive && payload.executive.length > 0) {
      const userRoles = new Set(payload.executive.map((e) => e.role));
      for (const required of requiredRoles) {
        if (userRoles.has(required as "president" | "treasurer" | "pro")) {
          return true;
        }
      }
    }

    // Admin role not yet implemented — reject for now
    if (requiredRoles.includes("admin")) {
      return false;
    }

    return false;
  }
}
