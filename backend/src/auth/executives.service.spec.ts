import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { ExecutivesService } from "./executives.service";
import { JwtPayload } from "./auth.service";

describe("ExecutivesService", () => {
  let service: ExecutivesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutivesService],
    }).compile();

    service = module.get<ExecutivesService>(ExecutivesService);
  });

  describe("requireExecutiveFor", () => {
    it("should return executiveId when user is an executive of the association", () => {
      const payload: JwtPayload = {
        sub: "user-1",
        email: "test@example.com",
        role: "student",
        executive: [
          {
            id: "exec-1",
            associationId: "assoc-1",
            role: "president",
          },
        ],
      };

      const result = service.requireExecutiveFor(payload, "assoc-1");
      expect(result.executiveId).toBe("exec-1");
      expect(result.role).toBe("president");
    });

    it("should throw when user has no executive roles", () => {
      const payload: JwtPayload = {
        sub: "user-1",
        email: "test@example.com",
        role: "student",
      };

      expect(() => service.requireExecutiveFor(payload, "assoc-1")).toThrow(
        ForbiddenException,
      );
    });

    it("should throw when user is not executive of this association", () => {
      const payload: JwtPayload = {
        sub: "user-1",
        email: "test@example.com",
        role: "student",
        executive: [
          {
            id: "exec-1",
            associationId: "assoc-2",
            role: "treasurer",
          },
        ],
      };

      expect(() => service.requireExecutiveFor(payload, "assoc-1")).toThrow(
        ForbiddenException,
      );
    });
  });
});
