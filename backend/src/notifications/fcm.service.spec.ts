import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { generateKeyPairSync } from "node:crypto";
import { FcmService } from "./fcm.service";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const serviceAccount = {
  client_email: "push@matriq-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  project_id: "matriq-test",
  token_uri: "https://oauth2.googleapis.com/token",
};

function configWith(extra: Record<string, string>) {
  return {
    provide: ConfigService,
    useValue: {
      get: (key: string) =>
        ({
          FCM_ENABLED: "true",
          FCM_PROJECT_ID: "matriq-test",
          FCM_SERVICE_ACCOUNT_B64: Buffer.from(JSON.stringify(serviceAccount)).toString("base64"),
          ...extra,
        })[key],
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FcmService", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // Mock the OAuth token exchange by default.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "token-1", expires_in: 3600 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("is disabled without FCM_ENABLED", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({ FCM_ENABLED: "false" })],
    }).compile();
    const svc = moduleRef.get(FcmService);
    expect(svc.isEnabled).toBe(false);
    expect(await svc.send("tok", { title: "t", body: "b" })).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is disabled when the service account is missing", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({ FCM_SERVICE_ACCOUNT_B64: "" })],
    }).compile();
    const svc = moduleRef.get(FcmService);
    expect(svc.isEnabled).toBe(false);
  });

  it("mints an OAuth token from the service account and sends via HTTP v1", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { name: "projects/matriq-test/messages/1" }));
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({})],
    }).compile();
    const svc = moduleRef.get(FcmService);

    const result = await svc.send("device-token", {
      title: "Dues due",
      body: "Pay before Friday",
      data: { link: "Fees", type: "dues" },
    });

    expect(result).toBe("sent");

    // 1) OAuth exchange: JWT bearer grant to Google's token endpoint.
    const oauthCall = fetchMock.mock.calls[0];
    expect(oauthCall[0]).toBe("https://oauth2.googleapis.com/token");
    const oauthBody = oauthCall[1].body as URLSearchParams;
    expect(oauthBody.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const assertion = oauthBody.get("assertion") ?? "";
    const [h, p, sig] = assertion.split(".");
    expect(h).toBeDefined();
    expect(p).toBeDefined();
    expect(sig).toBeTruthy();
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.iss).toBe(serviceAccount.client_email);
    expect(claims.scope).toContain("firebase.messaging");

    // 2) FCM send: correct endpoint, bearer token, branded android payload.
    const sendCall = fetchMock.mock.calls[1];
    expect(String(sendCall[0])).toContain(
      "/v1/projects/matriq-test/messages:send",
    );
    expect((sendCall[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer token-1",
    );
    const message = JSON.parse(String(sendCall[1].body)).message;
    expect(message.token).toBe("device-token");
    expect(message.notification.title).toBe("Dues due");
    expect(message.data).toEqual({ link: "Fees", type: "dues" });
    expect(message.android.priority).toBe("high");
    expect(message.android.notification.channel_id).toBe("matriq");
    expect(message.android.notification.icon).toBe("notification_icon");
    expect(message.android.notification.color).toBe("#7B4BC4");
  });

  it("reuses the cached OAuth token for subsequent sends", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { name: "m1" }))
      .mockResolvedValueOnce(jsonResponse(200, { name: "m2" }));
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({})],
    }).compile();
    const svc = moduleRef.get(FcmService);

    await svc.send("t1", { title: "a", body: "b" });
    await svc.send("t2", { title: "a", body: "b" });

    // Only one OAuth exchange for two sends.
    const oauthCount = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("oauth2"),
    ).length;
    expect(oauthCount).toBe(1);
  });

  it("reports invalid (unregistered) tokens for pruning", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({})],
    }).compile();
    const svc = moduleRef.get(FcmService);
    expect(await svc.send("dead-token", { title: "t", body: "b" })).toBe("invalid");
  });

  it("returns error (never throws) on a provider failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({})],
    }).compile();
    const svc = moduleRef.get(FcmService);
    expect(await svc.send("tok", { title: "t", body: "b" })).toBe("error");
  });

  it("returns error when the OAuth exchange fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    const moduleRef = await Test.createTestingModule({
      providers: [FcmService, configWith({})],
    }).compile();
    const svc = moduleRef.get(FcmService);
    expect(await svc.send("tok", { title: "t", body: "b" })).toBe("error");
  });
});
