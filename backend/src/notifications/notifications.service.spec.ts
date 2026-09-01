import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { FcmService } from "./fcm.service";

const configMock = {
  provide: ConfigService,
  useValue: {
    get: (key: string) =>
      ({ NTFY_ENABLED: "false", NTFY_URL: "http://ntfy:80" })[key],
  },
};

describe("NotificationsService — device registration", () => {
  let svc: NotificationsService;
  const prisma = {
    pushDevice: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    membership: { findMany: jest.fn() },
  };
  const fcm = { isEnabled: true, send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        configMock,
        { provide: PrismaService, useValue: prisma },
        { provide: FcmService, useValue: fcm },
      ],
    }).compile();
    svc = moduleRef.get(NotificationsService);
  });

  it("upserts a valid device token for the user", async () => {
    prisma.pushDevice.upsert.mockResolvedValue({ id: "d1" });
    const out = await svc.registerDevice("u1", "  abcdef123456  ", "Android");
    expect(out.registered).toBe(true);
    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith({
      where: { token: "abcdef123456" },
      create: { userId: "u1", token: "abcdef123456", platform: "android" },
      update: { userId: "u1", lastSeenAt: expect.any(Date) },
    });
  });

  it("rejects garbage tokens", async () => {
    const out = await svc.registerDevice("u1", "short", "android");
    expect(out.registered).toBe(false);
    expect(prisma.pushDevice.upsert).not.toHaveBeenCalled();
  });

  it("only removes the caller's own token on unregister", async () => {
    prisma.pushDevice.deleteMany.mockResolvedValue({ count: 1 });
    const out = await svc.unregisterDevice("u1", "tok-123");
    expect(out.removed).toBe(true);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: "tok-123", userId: "u1" },
    });
  });
});

describe("NotificationsService — delivery routing", () => {
  const prisma = {
    pushDevice: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    membership: { findMany: jest.fn() },
  };
  const fcm = { isEnabled: true, send: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  async function makeSvc(ntfyEnabled = "false") {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({ NTFY_ENABLED: ntfyEnabled, NTFY_URL: "http://ntfy:80" })[key],
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: FcmService, useValue: fcm },
      ],
    }).compile();
    return moduleRef.get(NotificationsService);
  }

  it("sends to the user's devices via FCM when FCM is enabled", async () => {
    fcm.isEnabled = true;
    fcm.send.mockResolvedValue("sent");
    prisma.pushDevice.findMany.mockResolvedValue([
      { id: "d1", token: "tok-1" },
      { id: "d2", token: "tok-2" },
    ]);
    const svc = await makeSvc();

    const delivered = await svc.notifyUser("u1", "Verified!", "You're approved", {
      data: { link: "VerificationStatus", type: "verification" },
    });

    expect(delivered).toBe(true);
    expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { id: true, token: true },
    });
    expect(fcm.send).toHaveBeenCalledTimes(2);
    expect(fcm.send).toHaveBeenCalledWith("tok-1", {
      title: "Verified!",
      body: "You're approved",
      data: { link: "VerificationStatus", type: "verification" },
    });
    expect(prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it("prunes dead tokens and falls back to ntfy when nothing delivers", async () => {
    fcm.isEnabled = true;
    fcm.send.mockResolvedValue("invalid");
    prisma.pushDevice.findMany.mockResolvedValue([{ id: "d1", token: "dead" }]);
    prisma.pushDevice.deleteMany.mockResolvedValue({ count: 1 });
    const svc = await makeSvc("true");

    const delivered = await svc.notifyUser("u1", "t", "m");

    expect(delivered).toBe(false); // ntfy disabled in this test env
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["d1"] } },
    });
  });

  it("pushes to all live members' devices for association broadcasts", async () => {
    fcm.isEnabled = true;
    fcm.send.mockResolvedValue("sent");
    prisma.membership.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ]);
    prisma.pushDevice.findMany.mockResolvedValue([{ id: "d1", token: "tok-1" }]);
    const svc = await makeSvc();

    const delivered = await svc.notifyAssociation("assoc-1", "Dues due", "Pay now");

    expect(delivered).toBe(true);
    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { associationId: "assoc-1", status: "live" },
      select: { userId: true },
    });
    expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1", "u2"] } },
      select: { id: true, token: true },
    });
  });

  it("falls back to the ntfy topic push when FCM is disabled", async () => {
    fcm.isEnabled = false;
    const fetchMock = jest.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = await makeSvc("true");

    const delivered = await svc.notifyUser("u1", "t", "m");

    expect(delivered).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://ntfy:80/matriq-user-u1");
    expect(fcm.send).not.toHaveBeenCalled();
  });
});
