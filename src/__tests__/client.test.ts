import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeployGateClient, DeployGateApiError } from "../client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("DeployGateClient", () => {
  let client: DeployGateClient;

  beforeEach(() => {
    client = new DeployGateClient("test-token");
    mockFetch.mockReset();
  });

  describe("token management", () => {
    it("hasToken returns false when no token is set", () => {
      const noTokenClient = new DeployGateClient();
      expect(noTokenClient.hasToken()).toBe(false);
    });

    it("hasToken returns true when token is set via constructor", () => {
      expect(client.hasToken()).toBe(true);
    });

    it("setToken updates the token used for requests", async () => {
      client.setToken("new-token");
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: [] }),
      );
      await client.getOrganizations();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer new-token");
    });

    it("setToken overrides the constructor token", async () => {
      const envClient = new DeployGateClient("env-token");
      envClient.setToken("session-token");
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: [] }),
      );
      await envClient.getOrganizations();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer session-token");
    });

    it("throws error when making request without token", async () => {
      const noTokenClient = new DeployGateClient();
      await expect(noTokenClient.getOrganizations()).rejects.toThrow(
        "API token is not set",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("empty-body responses", () => {
    it("returns {} when the response has no JSON body (e.g. 201 with empty body)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      });
      const result = await client.deleteDistribution("abc123");
      expect(result).toEqual({});
    });

    it("returns null for a 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      });
      const result = await client.deleteDistribution("abc123");
      expect(result).toBeNull();
    });

    it("propagates non-SyntaxError json() failures instead of masking them", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new TypeError("network read failed")),
      });
      await expect(client.deleteDistribution("abc123")).rejects.toThrow(TypeError);
    });
  });

  describe("request basics", () => {
    it("sends Authorization header", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: [] }),
      );
      await client.getOrganizations();

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations");
      expect(options.headers.Authorization).toBe("Bearer test-token");
    });

    it("sends User-Agent header identifying the plugin", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: [] }),
      );
      await client.getOrganizations();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["User-Agent"]).toMatch(
        /^deploygate-agent-plugin\/(\d+\.\d+\.\d+|dev)$/,
      );
    });

    it("throws DeployGateApiError on error response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          error: true,
          message: "Unauthorized",
          error_type: "unauthorized",
        }),
      );

      await expect(client.getOrganizations()).rejects.toThrow(
        DeployGateApiError,
      );
    });

    it("includes error_type and message on unauthorized (401)", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          error: true,
          message: "Unauthorized",
          error_type: "unauthorized",
        }),
      );

      try {
        await client.getOrganizations();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(DeployGateApiError);
        const err = e as DeployGateApiError;
        expect(err.errorType).toBe("unauthorized");
        expect(err.message).toBe("Unauthorized");
      }
    });

    it("includes invalid_params on validation error", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          error: true,
          message: "Validation failed",
          error_type: "invalid_params",
          invalid_params: [{ field: "title", reason: "too long" }],
        }),
      );

      try {
        await client.getOrganizations();
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as DeployGateApiError;
        expect(err.invalidParams).toHaveLength(1);
        expect(err.invalidParams![0].field).toBe("title");
      }
    });
  });

  describe("requestRaw", () => {
    it("omits Authorization header when authenticated: false", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        body: { a: 1 },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it("sends User-Agent header even on unauthenticated requests", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("GET", "/api/x", { authenticated: false });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["User-Agent"]).toMatch(
        /^deploygate-agent-plugin\/(\d+\.\d+\.\d+|dev)$/,
      );
    });

    it("sends extra headers", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        headers: { "X-Client-Nonce": "n0nce" },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Client-Nonce"]).toBe("n0nce");
    });

    it("returns { status, data } tuple", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ hello: "world" }, 200),
      );
      const res = await client.requestRaw("GET", "/api/x", {
        authenticated: false,
      });
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ hello: "world" });
    });

    it("returns data: null on 204 without calling .json()", async () => {
      const jsonSpy = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: jsonSpy,
      });
      const res = await client.requestRaw("DELETE", "/api/x", {
        authenticated: true,
      });
      expect(res.status).toBe(204);
      expect(res.data).toBeNull();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it("does NOT throw on non-2xx; caller inspects status", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "bad" }, 400),
      );
      const res = await client.requestRaw("GET", "/api/x", {
        authenticated: false,
      });
      expect(res.status).toBe(400);
      expect(res.data).toEqual({ error: true, message: "bad" });
    });

    it("serializes JSON body with Content-Type: application/json", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        body: { client_label: "test" },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe(JSON.stringify({ client_label: "test" }));
    });
  });

  describe("createDeviceCode", () => {
    it("POSTs to /api/sessions/codes with X-Client-Nonce and client_label", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              code: "ABCD1234",
              verification_url: "https://deploygate.com/app/sessions/codes",
              verification_uri_complete: "https://deploygate.com/app/sessions/codes?code=ABCD1234",
              expires_in: 300,
              interval: 5,
            },
          },
          200,
        ),
      );
      const noTokenClient = new DeployGateClient();
      const res = await noTokenClient.createDeviceCode("my-cli", "nonce-xyz");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/codes");
      expect(options.method).toBe("POST");
      expect(options.headers["X-Client-Nonce"]).toBe("nonce-xyz");
      expect(options.headers.Authorization).toBeUndefined();
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe(JSON.stringify({ client_label: "my-cli" }));

      expect(res).toEqual({
        code: "ABCD1234",
        verification_uri_complete:
          "https://deploygate.com/app/sessions/codes?code=ABCD1234",
        expires_in: 300,
        interval: 5,
      });
    });

    it("throws DeployGateApiError on error response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "Invalid X-Client-Nonce format." },
          400,
        ),
      );
      const noTokenClient = new DeployGateClient();
      await expect(
        noTokenClient.createDeviceCode("x", "bad"),
      ).rejects.toThrow(DeployGateApiError);
    });
  });

  describe("pollDeviceCode", () => {
    it("GETs /api/sessions/codes/<code> with X-Client-Nonce", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: false, results: { status: "pending" } },
          200,
        ),
      );
      const noTokenClient = new DeployGateClient();
      const res = await noTokenClient.pollDeviceCode("ABCD1234", "n0nce");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/codes/ABCD1234");
      expect(options.method).toBe("GET");
      expect(options.headers["X-Client-Nonce"]).toBe("n0nce");
      expect(options.headers.Authorization).toBeUndefined();
      expect(res).toEqual({ status: "pending" });
    });

    it("returns authorized with token and user on success", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              status: "authorized",
              api_token: "deploygate_cacc_xxx",
              user: { name: "kitakore", email: "k@example.com" },
            },
          },
          200,
        ),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({
        status: "authorized",
        api_token: "deploygate_cacc_xxx",
        user: { name: "kitakore", email: "k@example.com" },
      });
    });

    it("returns rejected on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "unauthorized" }, 401),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "rejected" });
    });

    it("returns nonce_mismatch on 400 Client nonce mismatch.", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "Client nonce mismatch." },
          400,
        ),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "nonce_mismatch" });
    });

    it("returns rate_limited on 429", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "too many requests" }, 429),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "rate_limited" });
    });

    it("throws DeployGateApiError on other 4xx", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "bad" }, 422),
      );
      await expect(
        new DeployGateClient().pollDeviceCode("C", "n"),
      ).rejects.toThrow(DeployGateApiError);
    });

    it("does not wrap authorized response in DeployGateApiError", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              status: "authorized",
              api_token: "t",
              user: { name: "u" },
            },
          },
          200,
        ),
      );
      await expect(
        new DeployGateClient().pollDeviceCode("C", "n"),
      ).resolves.toEqual(expect.objectContaining({ status: "authorized" }));
    });
  });

  describe("revokeCurrentToken", () => {
    it("DELETEs /api/sessions/current_token with bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => {
          throw new Error("should not be called");
        },
      });
      await client.revokeCurrentToken();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/current_token");
      expect(options.method).toBe("DELETE");
      expect(options.headers.Authorization).toBe("Bearer test-token");
    });

    it("throws DeployGateApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "unauthorized", error_type: "unauthorized" },
          401,
        ),
      );
      await expect(client.revokeCurrentToken()).rejects.toThrow(
        DeployGateApiError,
      );
    });

    it("throws when no token is set", async () => {
      const noTokenClient = new DeployGateClient();
      await expect(noTokenClient.revokeCurrentToken()).rejects.toThrow(
        "API token is not set",
      );
    });
  });

  describe("getOrganizations", () => {
    it("returns results from response", async () => {
      const orgs = [{ name: "my-workspace", projects: [] }];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: orgs }),
      );

      const result = await client.getOrganizations();
      expect(result).toEqual(orgs);
    });
  });

  describe("uploadApp", () => {
    it("sends multipart form data with file", async () => {
      const uploadResult = {
        name: "MyApp",
        package_name: "com.example.app",
        revision: 1,
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: uploadResult }),
      );

      // Create a temporary file for testing
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const os = await import("node:os");
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dg-test-"));
      const tmpFile = path.join(tmpDir, "test.apk");
      await fs.writeFile(tmpFile, "fake-apk-content");

      try {
        const result = await client.uploadApp("my-owner", tmpFile, {
          message: "test build",
          distribution_name: "Dev",
        });

        expect(result).toEqual(uploadResult);

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe(
          "https://deploygate.com/api/users/my-owner/apps",
        );
        expect(options.method).toBe("POST");
        expect(options.body).toBeInstanceOf(FormData);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });
  });

  describe("distribution management", () => {
    it("creates a distribution", async () => {
      const distResult = { access_key: "abc123", title: "Release" };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: distResult }),
      );

      const result = await client.createDistribution(
        "owner",
        "android",
        "com.example.app",
        { title: "Release" },
      );

      expect(result).toEqual(distResult);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/owner/platforms/android/apps/com.example.app/distributions",
      );
      expect(options.method).toBe("POST");
    });

    it("lists distributions", async () => {
      const dists = [{ access_key: "abc", title: "Dev" }];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: dists }),
      );

      const result = await client.listDistributions(
        "owner",
        "ios",
        "com.example.app",
      );
      expect(result).toEqual(dists);
    });

    it("gets a distribution by access_key", async () => {
      const dist = { access_key: "abc123", title: "Release", active: true };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: dist }),
      );

      const result = await client.getDistribution("abc123");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/distributions/abc123",
      );
      expect(result).toEqual(dist);
    });

    it("updates a distribution with required params", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.updateDistribution("abc123", {
        title: "New Title",
        active: true,
        release_scope: "unlisted",
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/distributions/abc123",
      );
      expect(options.method).toBe("PUT");
      expect(options.body).toContain("active=true");
      expect(options.body).toContain("release_scope=unlisted");
    });

    it("deletes a distribution", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.deleteDistribution("abc123");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/distributions/abc123",
      );
      expect(options.method).toBe("DELETE");
    });
  });

  describe("getUdids", () => {
    it("fetches UDID list", async () => {
      const udids = [
        {
          udid: "00008030-001234567890001E",
          user_name: "tester1",
          device_name: "iPhone 15 Pro",
          is_provisioned: false,
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: udids }),
      );

      const result = await client.getUdids("owner", "com.example.app");
      expect(result).toEqual(udids);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/owner/platforms/ios/apps/com.example.app/udids",
      );
    });
  });

  describe("member management", () => {
    it("adds workspace member", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.addWorkspaceMember("my-workspace", "user@example.com");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/my-workspace/users",
      );
      expect(options.method).toBe("POST");
      expect(options.body).toContain("user=user%40example.com");
    });

    it("adds project member", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.addProjectMember(
        "my-workspace",
        "my-project",
        "user@example.com",
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/my-workspace/organizations/my-project/users",
      );
    });

    it("adds team member", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.addTeamMember("my-project", "developer", "user1");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/teams/developer/users",
      );
    });

    it("assigns team to app", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.assignTeamToApp(
        "my-project",
        "android",
        "com.example.app",
        "tester",
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams",
      );
      expect(options.body).toContain("team=tester");
    });

    it("lists team members", async () => {
      const members = [{ name: "user1" }, { name: "user2" }];
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: members }),
      );

      const result = await client.listTeamMembers("my-project", "developer");
      expect(result).toEqual(members);
    });
  });

  describe("app detail & binaries", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("getApp builds the app path with optional revision query", async () => {
      await client.getApp("alice", "android", "com.example.app", { revision: 5 });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app?revision=5",
      );
      expect(options.method).toBe("GET");
    });

    it("listAppRevisions builds the binaries path with page", async () => {
      await client.listAppRevisions("alice", "ios", "com.example.app", { page: 2 });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/ios/apps/com.example.app/binaries?page=2",
      );
    });

    it("getAppRevision targets a revision", async () => {
      await client.getAppRevision("alice", "android", "com.example.app", 7);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
      );
    });

    it("updateAppRevision sends PATCH with message and v2 header", async () => {
      await client.updateAppRevision("alice", "android", "com.example.app", 7, "note");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
      );
      expect(options.method).toBe("PATCH");
      expect(options.body).toContain("message=note");
      expect(options.headers["X-DEPLOYGATE-API-VERSION"]).toBe("2");
    });

    it("deleteAppRevision sends DELETE", async () => {
      await client.deleteAppRevision("alice", "android", "com.example.app", 7);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
      );
      expect(options.method).toBe("DELETE");
    });

    it("protectAppRevision posts to /protect", async () => {
      await client.protectAppRevision("alice", "android", "com.example.app", 7);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7/protect",
      );
      expect(options.method).toBe("POST");
    });

    it("unprotectAppRevision deletes /protect", async () => {
      await client.unprotectAppRevision("alice", "android", "com.example.app", 7);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7/protect",
      );
      expect(options.method).toBe("DELETE");
    });

    it("searchAppRevisions sends q and v2 header", async () => {
      await client.searchAppRevisions("alice", "android", "com.example.app", { q: "v1.2" });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/search?q=v1.2",
      );
      expect(options.method).toBe("GET");
      expect(options.headers["X-DEPLOYGATE-API-VERSION"]).toBe("2");
    });

    it("searchAppRevisions encodes paging params", async () => {
      await client.searchAppRevisions("alice", "android", "com.example.app", {
        q: "v1",
        page: 2,
        perPage: 25,
      });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/search?q=v1&paging%5Bpage%5D=2&paging%5Bper_page%5D=25",
      );
    });
  });

  describe("app members", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listAppMembers GETs the members path", async () => {
      await client.listAppMembers("alice", "android", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/members",
      );
      expect(options.method).toBe("GET");
    });
  });

  describe("distribution extensions", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("deleteDistributionByName DELETEs with distribution_name query", async () => {
      await client.deleteDistributionByName("alice", "android", "com.example.app", "QA build");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/distributions?distribution_name=QA+build",
      );
      expect(options.method).toBe("DELETE");
    });

    it("updateDistributionRevision POSTs revision to packages", async () => {
      await client.updateDistributionRevision("abcdef", { revision: 12, release_note: "hot" });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/distributions/abcdef/packages");
      expect(options.method).toBe("POST");
      expect(options.body).toContain("revision=12");
      expect(options.body).toContain("release_note=hot");
    });

    it("updateDistribution forwards ip_restriction params", async () => {
      await client.updateDistribution("abcdef", {
        active: true,
        release_scope: "unlisted",
        ip_restriction_enable: true,
        ip_restriction: "10.0.0.0/24",
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain("ip_restriction_enable=true");
      expect(options.body).toContain("ip_restriction=10.0.0.0%2F24");
    });
  });

  describe("shared teams", () => {
    it("creates a shared team", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: { id: "team-1" } }),
      );

      const result = await client.createSharedTeam("my-workspace", "all staff");
      expect(result).toEqual({ id: "team-1" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/my-workspace/shared_teams",
      );
      expect(options.body).toContain("name=all+staff");
    });

    it("adds member to shared team with email", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.addSharedTeamMember("my-workspace", "team-1", {
        email: "user@example.com",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/my-workspace/shared_teams/team-1/users",
      );
    });

    it("assigns shared team to app", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );

      await client.assignSharedTeamToApp(
        "my-project",
        "android",
        "com.example.app",
        "all staff",
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams",
      );
      expect(options.body).toContain("team=all+staff");
    });
  });

  describe("keystores", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("getKeystore GETs /keystores", async () => {
      await client.getKeystore("alice", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores",
      );
      expect(options.method).toBe("GET");
    });

    it("createKeystore POSTs /keystores", async () => {
      await client.createKeystore("alice", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores",
      );
      expect(options.method).toBe("POST");
    });

    it("deleteKeystore DELETEs /keystores", async () => {
      await client.deleteKeystore("alice", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores",
      );
      expect(options.method).toBe("DELETE");
    });

    it("downloadKeystore GETs keystores/download", async () => {
      await client.downloadKeystore("alice", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/download",
      );
      expect(options.method).toBe("GET");
    });

    it("updateKeystore PUTs multipart form-data", async () => {
      const { writeFile, mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "ks-"));
      const file = join(dir, "release.keystore");
      await writeFile(file, "dummy");

      await client.updateKeystore("alice", "com.example.app", {
        filePath: file,
        aliasName: "release",
        keystorePassword: "pw1",
        keyPassword: "pw2",
      });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores",
      );
      expect(options.method).toBe("PUT");
      expect(options.body).toBeInstanceOf(FormData);
    });
  });

  describe("app teams", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listAppTeams GETs the teams path", async () => {
      await client.listAppTeams("my-project", "android", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams",
      );
      expect(options.method).toBe("GET");
    });

    it("removeAppTeam DELETEs the team", async () => {
      await client.removeAppTeam("my-project", "android", "com.example.app", "qa");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams/qa",
      );
      expect(options.method).toBe("DELETE");
    });

    it("removeAppTeam URL-encodes the team name", async () => {
      await client.removeAppTeam("my-project", "android", "com.example.app", "all staff");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams/all%20staff",
      );
    });

    it("listAppSharedTeams GETs the shared_teams path", async () => {
      await client.listAppSharedTeams("my-project", "android", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams",
      );
      expect(options.method).toBe("GET");
    });

    it("removeAppSharedTeam DELETEs the shared team", async () => {
      await client.removeAppSharedTeam("my-project", "android", "com.example.app", "all staff");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams/all%20staff",
      );
      expect(options.method).toBe("DELETE");
    });
  });

  describe("workspace members", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listWorkspaceMembers GETs the users path", async () => {
      await client.listWorkspaceMembers("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users");
      expect(options.method).toBe("GET");
    });

    it("getWorkspaceMember GETs and encodes the id", async () => {
      await client.getWorkspaceMember("ws1", "a@b.com");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users/a%40b.com");
      expect(options.method).toBe("GET");
    });

    it("addWorkspaceMember POSTs just the user when no options", async () => {
      await client.addWorkspaceMember("ws1", "alice");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users");
      expect(options.method).toBe("POST");
      expect(options.body).toBe("user=alice");
    });

    it("addWorkspaceMember POSTs full_name and role when provided", async () => {
      await client.addWorkspaceMember("ws1", "a@b.com", { full_name: "A B", role: "guest" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain("user=a%40b.com");
      expect(options.body).toContain("full_name=A+B");
      expect(options.body).toContain("role=guest");
    });

    it("removeWorkspaceMember DELETEs and encodes the user", async () => {
      await client.removeWorkspaceMember("ws1", "a@b.com");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users/a%40b.com");
      expect(options.method).toBe("DELETE");
    });
  });

  describe("user lookup", () => {
    it("getUser GETs the user path", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: false, results: {} }));
      await client.getUser("alice");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/users/alice");
      expect(options.method).toBe("GET");
    });
  });

  describe("projects (organizations)", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("getProject GETs the organization", async () => {
      await client.getProject("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("GET");
    });

    it("updateProject PATCHes display_name and description", async () => {
      await client.updateProject("my-project", {
        display_name: "My Project",
        description: "hello",
      });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("PATCH");
      expect(options.body).toContain("display_name=My+Project");
      expect(options.body).toContain("description=hello");
    });

    it("updateProject omits undefined fields", async () => {
      await client.updateProject("my-project", { description: "only desc" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("description=only+desc");
    });

    it("deleteProject DELETEs the organization", async () => {
      await client.deleteProject("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("DELETE");
    });

    it("listProjectApps GETs the apps path", async () => {
      await client.listProjectApps("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project/apps");
      expect(options.method).toBe("GET");
    });

    it("listProjectMembers GETs the members path", async () => {
      await client.listProjectMembers("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project/members");
      expect(options.method).toBe("GET");
    });
  });

  describe("workspace shared teams", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listSharedTeams GETs the shared_teams path", async () => {
      await client.listSharedTeams("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/shared_teams");
      expect(options.method).toBe("GET");
    });

    it("deleteSharedTeam DELETEs and encodes the team name", async () => {
      await client.deleteSharedTeam("ws1", "all staff");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/shared_teams/all%20staff",
      );
      expect(options.method).toBe("DELETE");
    });
  });

  describe("workspace projects", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listWorkspaceProjects GETs the organizations path", async () => {
      await client.listWorkspaceProjects("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/organizations");
      expect(options.method).toBe("GET");
    });

    it("createProject POSTs name and owner", async () => {
      await client.createProject("ws1", {
        owner_name_or_email: "alice",
        name: "new-proj",
        display_name: "New Proj",
        description: "hi",
      });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/organizations");
      expect(options.method).toBe("POST");
      expect(options.body).toContain("owner_name_or_email=alice");
      expect(options.body).toContain("name=new-proj");
      expect(options.body).toContain("display_name=New+Proj");
      expect(options.body).toContain("description=hi");
    });

    it("createProject omits undefined optional fields", async () => {
      await client.createProject("ws1", { owner_name_or_email: "alice", name: "p" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("owner_name_or_email=alice&name=p");
    });

    it("listWorkspaceProjectMembers GETs the nested users path", async () => {
      await client.listWorkspaceProjectMembers("ws1", "proj1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/organizations/proj1/users",
      );
      expect(options.method).toBe("GET");
    });
  });
});
