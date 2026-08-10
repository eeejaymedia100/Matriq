import { Injectable, ForbiddenException } from "@nestjs/common";
import { JwtPayload } from "./auth.service";

@Injectable()
export class ExecutivesService {
  /**
   * Resolve the executive ID for a given association from the JWT payload.
   * Throws ForbiddenException if the user is not an executive of this association.
   */
  requireExecutiveFor(
    payload: JwtPayload,
    associationId: string,
  ): { executiveId: string; role: "president" | "treasurer" | "pro" } {
    if (!payload.executive || payload.executive.length === 0) {
      throw new ForbiddenException(
        "You must be an executive of this association",
      );
    }

    const match = payload.executive.find(
      (e) => e.associationId === associationId,
    );

    if (!match) {
      throw new ForbiddenException(
        "You must be an executive of this association",
      );
    }

    return { executiveId: match.id, role: match.role };
  }
}
