import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { LibraryService } from "./library.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const publicItem = {
  id: "item-1",
  userId: "user-uploader",
  associationId: "assoc-1",
  courseCode: "CHM 101",
  title: "General Chemistry past questions",
  courseTitle: "General Chemistry I",
  type: "material",
  visibility: "public",
  moderationStatus: "approved",
  hidden: false,
  deletedAt: null,
  mimeType: "image/jpeg",
  sizeBytes: 2000,
  level: null,
  session: null,
  description: null,
  opens: 5,
  savesCount: 2,
  createdAt: new Date(),
  storageRef: "vault/assoc-1/user-1/x.jpg",
  companionRef: "data:image/jpeg;base64,AAAA",
  companionMimeType: "image/jpeg",
  faculty: "Science",
  department: "Chemistry",
  institutionId: "inst-1",
  institution: { id: "inst-1", name: "Test University" },
};

const privateItem = {
  ...publicItem,
  id: "private-1",
  userId: "user-2",
  visibility: "private",
  moderationStatus: "approved",
};

const hiddenItem = {
  ...publicItem,
  id: "hidden-1",
  hidden: true,
};

function mockPrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "reader-1",
        institutionId: "inst-1",
        faculty: "Science",
        department: "Chemistry",
        level: "200",
      }),
    },
    vaultItem: {
      findMany: jest.fn().mockResolvedValue([publicItem]),
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === "private-1") return Promise.resolve(privateItem);
        if (where.id === "hidden-1") return Promise.resolve(hiddenItem);
        if (where.id === "missing") return Promise.resolve(null);
        return Promise.resolve(publicItem);
      }),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(publicItem),
    },
    libraryView: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    librarySave: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    libraryReport: {
      create: jest.fn().mockResolvedValue({ id: "report-1", status: "open" }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        id: "report-1",
        vaultItemId: "item-1",
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((arr: Promise<unknown>[]) => Promise.all(arr)),
  };
}

describe("LibraryService", () => {
  let service: LibraryService;
  let prisma: PrismaService;

  const mockStorage = {
    isEnabled: true,
    presignedGetUrl: jest.fn().mockResolvedValue("https://s3/x?signature"), 
    presignedPutUrl: jest.fn().mockResolvedValue("https://s3/put"),
    put: jest.fn().mockResolvedValue("vault/k"),
    getBuffer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("discovery", () => {
    it("builds an empty-but-shaped home for a brand-new student", async () => {
      const result = await service.discovery("reader-1");
      expect(result.hasPersonalization).toBe(true);
      expect(Array.isArray(result.continueReading)).toBe(true);
      expect(Array.isArray(result.recommended)).toBe(true);
      expect(Array.isArray(result.popular)).toBe(true);
      // The fallback populates "recommended" with recent public docs rather
      // than leaving it empty.
      expect(result.recommended.length).toBeGreaterThan(0);
    });

    it("never leaks storageRef on cards", async () => {
      (prisma.vaultItem.findMany as jest.Mock).mockResolvedValue([publicItem]);
      const result = await service.discovery("reader-1");
      const popular = result.popular[0] as any;
      if (popular) {
        expect(popular).not.toHaveProperty("storageRef");
        expect(popular).not.toHaveProperty("companionRef");
      }
    });
  });

  describe("search", () => {
    it("always constrains to public + approved + not hidden + not deleted", async () => {
      await service.search({ query: "chemistry" });
      const where = (prisma.vaultItem.findMany as jest.Mock).mock.calls[0][0]
        .where;
      expect(where.visibility).toBe("public");
      expect(where.moderationStatus).toBe("approved");
      expect(where.hidden).toBe(false);
      expect(where.deletedAt).toBe(null);
      expect(Array.isArray(where.OR)).toBe(true);
    });

    it("filters by institution/faculty/department/level/session/type", async () => {
      await service.search({
        institutionId: "inst-1",
        faculty: "Science",
        department: "Chemistry",
        level: "200",
        session: "2023/2024",
        type: "past_question",
      });
      const where = (prisma.vaultItem.findMany as jest.Mock).mock.calls[0][0]
        .where;
      expect(where.institutionId).toBe("inst-1");
      expect(where.level).toBe("200");
      expect(where.type).toBe("past_question");
    });

    it("paginates and reports hasMore", async () => {
      (prisma.vaultItem.count as jest.Mock).mockResolvedValue(50);
      const result = await service.search({ page: 2, pageSize: 20 });
      expect(result.hasMore).toBe(true);
      const call = (prisma.vaultItem.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(20);
      expect(call.take).toBe(20);
    });
  });

  describe("recordView", () => {
    it("daily-dedups the opens counter per user", async () => {
      (prisma.libraryView.findUnique as jest.Mock).mockResolvedValue({
        id: "v1",
        userId: "reader-1",
        vaultItemId: "item-1",
        lastOpenDay: new Date().toISOString().slice(0, 10), // same day
        lastOpenMaybe: true,
      });
      await service.recordView("reader-1", "item-1", { position: "p=40" });
      // Same day → NOT counted as a fresh open → no vaultItem.opens increment.
      const updateCall = (prisma.vaultItem.update as jest.Mock).mock.calls[0];
      expect(updateCall).toBeUndefined();
    });

    it("counts a fresh open when it's the first open of a new day", async () => {
      (prisma.libraryView.findUnique as jest.Mock).mockResolvedValue(null);
      await service.recordView("reader-1", "item-1", { progress: 0.5 });
      const opensUpdate = (prisma.vaultItem.update as jest.Mock).mock.calls.find(
        ([args]: [any]) => args?.data?.opens?.increment === 1,
      );
      expect(opensUpdate).toBeDefined();
    });

    it("rejects views on private/unauthorised documents", async () => {
      await expect(
        service.recordView("reader-1", "private-1", {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects views on hidden/removed documents", async () => {
      await expect(
        service.recordView("reader-1", "hidden-1", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("save / unsave", () => {
    it("bookmarks a public document without duplicating the file", async () => {
      await service.save("reader-1", "item-1");
      const upsert = (prisma.librarySave.upsert as jest.Mock).mock.calls[0][0];
      expect(upsert.where.userId_vaultItemId).toEqual({
        userId: "reader-1",
        vaultItemId: "item-1",
      });
    });

    it("cannot save a private document that isn't the reader's", async () => {
      await expect(service.save("reader-1", "private-1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("report", () => {
    it("validates the reason", async () => {
      await expect(
        service.report("reader-1", "item-1", "not_a_reason" as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates an open report for a valid reason", async () => {
      const result = await service.report(
        "reader-1",
        "item-1",
        "inappropriate",
        "Contains adverts",
      );
      expect(result.status).toBe("open");
      expect(prisma.libraryReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: "inappropriate",
            details: "Contains adverts",
          }),
        }),
      );
    });
  });

  describe("access control", () => {
    it("directReadUrl denies unauthorised readers of private docs", async () => {
      await expect(
        service.directReadUrl("reader-1", "private-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("directReadUrl issues a presigned URL for an approved public doc", async () => {
      const url = await service.directReadUrl("reader-1", "item-1");
      expect(url).toContain("signature");
    });
  });
});