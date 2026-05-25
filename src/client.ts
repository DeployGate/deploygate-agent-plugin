import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { VERSION } from "./version.js";

const BASE_URL = "https://deploygate.com";
const USER_AGENT = `deploygate-agent-plugin/${VERSION}`;

export interface DeployGateErrorDetail {
  error: true;
  message: string;
  because?: string;
  error_type?: string;
  invalid_params?: Array<{ field: string; reason: string }>;
}

export class DeployGateApiError extends Error {
  readonly errorType?: string;
  readonly because?: string;
  readonly invalidParams?: Array<{ field: string; reason: string }>;

  constructor(response: DeployGateErrorDetail) {
    super(response.message);
    this.name = "DeployGateApiError";
    this.errorType = response.error_type;
    this.because = response.because;
    this.invalidParams = response.invalid_params;
  }
}

export class DeployGateClient {
  private token: string | undefined;

  constructor(token?: string) {
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  hasToken(): boolean {
    return this.token !== undefined && this.token !== "";
  }

  async requestRaw(
    method: string,
    path: string,
    options: {
      authenticated: boolean;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    },
  ): Promise<{ status: number; data: unknown }> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...(options.headers ?? {}),
    };

    if (options.authenticated) {
      if (!this.token) {
        throw new Error(
          "API token is not set. Run the `login_start` tool to obtain one.",
        );
      }
      headers.Authorization = `Bearer ${this.token}`;
    }

    const fetchOptions: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    if (response.status === 204) {
      return { status: 204, data: null };
    }
    const data = (await response.json()) as unknown;
    return { status: response.status, data };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      formData?: FormData;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        "API token is not set. Run the `login_start` tool to obtain one.",
      );
    }
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${this.token}`,
      ...(options?.headers ?? {}),
    };

    const fetchOptions: RequestInit = { method, headers };

    if (options?.formData) {
      fetchOptions.body = options.formData;
    } else if (options?.body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.body)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      fetchOptions.body = params.toString();
    }

    const response = await fetch(url, fetchOptions);
    if (response.status === 204) {
      return null as T;
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;

    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }

    return (data.results ?? data) as T;
  }

  // --- Auth / User info ---

  async getOrganizations(): Promise<unknown> {
    return this.request("GET", "/api/organizations");
  }

  async getUser(id: string): Promise<unknown> {
    return this.request("GET", `/api/users/${id}`);
  }

  // --- Device auth code flow ---

  async createDeviceCode(
    clientLabel: string,
    nonce: string,
  ): Promise<{
    code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  }> {
    const res = await this.requestRaw("POST", "/api/sessions/codes", {
      authenticated: false,
      headers: { "X-Client-Nonce": nonce },
      body: { client_label: clientLabel },
    });
    const data = res.data as { error?: boolean; results?: Record<string, unknown> } | null;
    if (!data || data.error) {
      throw new DeployGateApiError(
        (data as unknown as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }
    const r = data.results as {
      code: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };
    return {
      code: r.code,
      verification_uri_complete: r.verification_uri_complete,
      expires_in: r.expires_in,
      interval: r.interval,
    };
  }

  async pollDeviceCode(
    code: string,
    nonce: string,
  ): Promise<
    | { status: "pending" }
    | {
        status: "authorized";
        api_token: string;
        user: Record<string, unknown>;
      }
    | { status: "rejected" }
    | { status: "nonce_mismatch" }
    | { status: "rate_limited" }
  > {
    const res = await this.requestRaw("GET", `/api/sessions/codes/${code}`, {
      authenticated: false,
      headers: { "X-Client-Nonce": nonce },
    });

    if (res.status === 401) return { status: "rejected" };
    if (res.status === 429) return { status: "rate_limited" };
    if (res.status === 400) {
      const d = res.data as { message?: string } | null;
      if (d?.message === "Client nonce mismatch.") {
        return { status: "nonce_mismatch" };
      }
      throw new DeployGateApiError(d as DeployGateErrorDetail);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new DeployGateApiError(
        (res.data as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }

    const data = res.data as { error?: boolean; results?: Record<string, unknown> };
    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }
    const r = data.results as Record<string, unknown>;
    if (r.status === "pending") return { status: "pending" };
    if (r.status === "authorized") {
      return {
        status: "authorized",
        api_token: r.api_token as string,
        user: r.user as Record<string, unknown>,
      };
    }
    throw new DeployGateApiError({
      error: true,
      message: `Unexpected poll status: ${String(r.status)}`,
    });
  }

  async revokeCurrentToken(): Promise<void> {
    const res = await this.requestRaw("DELETE", "/api/sessions/current_token", {
      authenticated: true,
    });
    if (res.status === 204) return;
    if (res.status < 200 || res.status >= 300) {
      throw new DeployGateApiError(
        (res.data as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }
  }

  // --- App detail & binaries (revisions) ---

  private appBase(owner: string, platform: string, appId: string): string {
    return `/api/users/${owner}/platforms/${platform}/apps/${appId}`;
  }

  async getApp(
    owner: string,
    platform: string,
    appId: string,
    options?: { revision?: number; key?: string },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.revision !== undefined)
      params.set("revision", String(options.revision));
    // `key` (app secret) is supported for completeness but not exposed as a tool
    // param — it is redundant under Bearer-token auth.
    if (options?.key !== undefined) params.set("key", options.key);
    const qs = params.toString();
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}${qs ? `?${qs}` : ""}`,
    );
  }

  async listAppRevisions(
    owner: string,
    platform: string,
    appId: string,
    options?: { page?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.page !== undefined) params.set("page", String(options.page));
    const qs = params.toString();
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries${qs ? `?${qs}` : ""}`,
    );
  }

  async getAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
    );
  }

  async updateAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
    message: string,
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
      {
        body: { message },
        headers: { "X-DEPLOYGATE-API-VERSION": "2" },
      },
    );
  }

  async deleteAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
    );
  }

  async protectAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}/protect`,
    );
  }

  async unprotectAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}/protect`,
    );
  }

  async searchAppRevisions(
    owner: string,
    platform: string,
    appId: string,
    options: { q: string; page?: number; perPage?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("q", options.q);
    if (options.page !== undefined) params.set("paging[page]", String(options.page));
    if (options.perPage !== undefined)
      params.set("paging[per_page]", String(options.perPage));
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries/search?${params.toString()}`,
      { headers: { "X-DEPLOYGATE-API-VERSION": "2" } },
    );
  }

  // --- App members ---

  async listAppMembers(
    owner: string,
    platform: string,
    appId: string,
  ): Promise<unknown> {
    return this.request("GET", `${this.appBase(owner, platform, appId)}/members`);
  }

  // --- App upload ---

  async uploadApp(
    ownerName: string,
    filePath: string,
    options?: {
      message?: string;
      distribution_key?: string;
      distribution_name?: string;
      release_note?: string;
      disable_notify?: boolean;
      ios_simulator_zip?: string;
    },
  ): Promise<unknown> {
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append("file", blob, fileName);

    if (options?.message) formData.append("message", options.message);
    if (options?.distribution_key)
      formData.append("distribution_key", options.distribution_key);
    if (options?.distribution_name)
      formData.append("distribution_name", options.distribution_name);
    if (options?.release_note)
      formData.append("release_note", options.release_note);
    if (options?.disable_notify) formData.append("disable_notify", "true");
    if (options?.ios_simulator_zip) {
      const simBuffer = await readFile(options.ios_simulator_zip);
      const simFileName = basename(options.ios_simulator_zip);
      const simBlob = new Blob([simBuffer]);
      formData.append("ios_simulator_zip", simBlob, simFileName);
    }

    return this.request("POST", `/api/users/${ownerName}/apps`, { formData });
  }

  // --- Distribution management ---

  async createDistribution(
    ownerName: string,
    platform: string,
    appId: string,
    params: {
      title: string;
      release_note?: string;
      revision?: number;
      active?: boolean;
    },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/users/${ownerName}/platforms/${platform}/apps/${appId}/distributions`,
      { body: params as Record<string, unknown> },
    );
  }

  async listDistributions(
    ownerName: string,
    platform: string,
    appId: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/api/users/${ownerName}/platforms/${platform}/apps/${appId}/distributions`,
    );
  }

  async getDistribution(accessKey: string): Promise<unknown> {
    return this.request("GET", `/api/distributions/${accessKey}`);
  }

  async updateDistribution(
    accessKey: string,
    params: {
      title?: string;
      active: boolean;
      release_scope: string;
      passcode?: string;
      release_note?: string;
      ip_restriction_enable?: boolean;
      ip_restriction?: string;
    },
  ): Promise<unknown> {
    return this.request("PUT", `/api/distributions/${accessKey}`, {
      body: params as Record<string, unknown>,
    });
  }

  async deleteDistribution(accessKey: string): Promise<unknown> {
    return this.request("DELETE", `/api/distributions/${accessKey}`);
  }

  async deleteDistributionByName(
    owner: string,
    platform: string,
    appId: string,
    distributionName: string,
  ): Promise<unknown> {
    const qs = new URLSearchParams({ distribution_name: distributionName }).toString();
    return this.request(
      "DELETE",
      `/api/users/${owner}/platforms/${platform}/apps/${appId}/distributions?${qs}`,
    );
  }

  async updateDistributionRevision(
    accessKey: string,
    params: { revision: number; release_note?: string },
  ): Promise<unknown> {
    return this.request("POST", `/api/distributions/${accessKey}/packages`, {
      body: params as Record<string, unknown>,
    });
  }

  // --- iOS UDIDs ---

  async getUdids(ownerName: string, appId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/users/${ownerName}/platforms/ios/apps/${appId}/udids`,
    );
  }

  // --- Workspace member management ---

  async addWorkspaceMember(workspace: string, user: string): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/users`, {
      body: { user },
    });
  }

  async removeWorkspaceMember(
    workspace: string,
    user: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/enterprises/${workspace}/users/${user}`,
    );
  }

  // --- Project member management ---

  async addProjectMember(
    workspace: string,
    project: string,
    user: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/enterprises/${workspace}/organizations/${project}/users`,
      { body: { user } },
    );
  }

  async removeProjectMember(
    workspace: string,
    project: string,
    user: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/enterprises/${workspace}/organizations/${project}/users/${user}`,
    );
  }

  // --- Team member management ---

  async addTeamMember(
    project: string,
    team: string,
    user: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/organizations/${project}/teams/${team}/users`,
      { body: { user } },
    );
  }

  async listTeamMembers(project: string, team: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/organizations/${project}/teams/${team}/users`,
    );
  }

  async removeTeamMember(
    project: string,
    team: string,
    user: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/organizations/${project}/teams/${team}/users/${user}`,
    );
  }

  // --- App team assignment ---

  async assignTeamToApp(
    project: string,
    platform: string,
    appId: string,
    team: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/organizations/${project}/platforms/${platform}/apps/${appId}/teams`,
      { body: { team } },
    );
  }

  // --- Shared teams ---

  async createSharedTeam(workspace: string, name: string): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/shared_teams`, {
      body: { name },
    });
  }

  async addSharedTeamMember(
    workspace: string,
    sharedTeamId: string,
    params: { email?: string; username?: string; description?: string },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users`,
      { body: params as Record<string, unknown> },
    );
  }

  async listSharedTeamMembers(
    workspace: string,
    sharedTeamId: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users`,
    );
  }

  async removeSharedTeamMember(
    workspace: string,
    sharedTeamId: string,
    userId: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users/${userId}`,
    );
  }

  async assignSharedTeamToApp(
    project: string,
    platform: string,
    appId: string,
    team: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/organizations/${project}/platforms/${platform}/apps/${appId}/shared_teams`,
      { body: { team } },
    );
  }

  // --- Android keystores ---

  private keystoreBase(owner: string, appId: string): string {
    return `/api/users/${owner}/platforms/android/apps/${appId}/keystores`;
  }

  async getKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("GET", this.keystoreBase(owner, appId));
  }

  async createKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("POST", this.keystoreBase(owner, appId));
  }

  async deleteKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("DELETE", this.keystoreBase(owner, appId));
  }

  async downloadKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("GET", `${this.keystoreBase(owner, appId)}/download`);
  }

  async updateKeystore(
    owner: string,
    appId: string,
    params: {
      filePath: string;
      aliasName: string;
      keystorePassword: string;
      keyPassword: string;
    },
  ): Promise<unknown> {
    const fileBuffer = await readFile(params.filePath);
    const fileName = basename(params.filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), fileName);
    formData.append("alias_name", params.aliasName);
    formData.append("keystore_password", params.keystorePassword);
    formData.append("key_password", params.keyPassword);
    return this.request("PUT", this.keystoreBase(owner, appId), {
      formData,
    });
  }
}
