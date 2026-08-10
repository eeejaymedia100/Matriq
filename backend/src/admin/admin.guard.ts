import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";

/**
 * Guard for admin-only routes.
 * Checks that the JWT payload includes role = "admin".
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role !== "admin") {
      return false;
    }

    return true;
  }
}
