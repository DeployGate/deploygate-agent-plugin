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

  describe("shared teams", () => {
    it("creates a shared team", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: { id: "team-1" } }),
      );

      const result = await client.createSharedTeam("my-workspace", "all staff");
      expect(result).toEqual({ id: "team-1" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/my-workspace/sharedteams",
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
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/sharedteams",
      );
      expect(options.body).toContain("team=all+staff");
    });
  });
});
