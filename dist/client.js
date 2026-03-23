import { readFile } from "node:fs/promises";
import { basename } from "node:path";
const BASE_URL = "https://deploygate.com";
export class DeployGateApiError extends Error {
    errorType;
    because;
    invalidParams;
    constructor(response) {
        super(response.message);
        this.name = "DeployGateApiError";
        this.errorType = response.error_type;
        this.because = response.because;
        this.invalidParams = response.invalid_params;
    }
}
export class DeployGateClient {
    token;
    constructor(token) {
        this.token = token;
    }
    setToken(token) {
        this.token = token;
    }
    hasToken() {
        return this.token !== undefined && this.token !== "";
    }
    async request(method, path, options) {
        if (!this.token) {
            throw new Error("API token is not set. Use the set_api_token tool to set your token, or set the DEPLOYGATE_API_TOKEN environment variable.");
        }
        const url = `${BASE_URL}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
        };
        const fetchOptions = { method, headers };
        if (options?.formData) {
            fetchOptions.body = options.formData;
        }
        else if (options?.body) {
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
        const data = (await response.json());
        if (data.error) {
            throw new DeployGateApiError(data);
        }
        return (data.results ?? data);
    }
    // --- Auth / User info ---
    async getOrganizations() {
        return this.request("GET", "/api/organizations");
    }
    // --- App upload ---
    async uploadApp(ownerName, filePath, options) {
        const fileBuffer = await readFile(filePath);
        const fileName = basename(filePath);
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append("file", blob, fileName);
        if (options?.message)
            formData.append("message", options.message);
        if (options?.distribution_key)
            formData.append("distribution_key", options.distribution_key);
        if (options?.distribution_name)
            formData.append("distribution_name", options.distribution_name);
        if (options?.release_note)
            formData.append("release_note", options.release_note);
        if (options?.disable_notify)
            formData.append("disable_notify", "true");
        if (options?.ios_simulator_zip) {
            const simBuffer = await readFile(options.ios_simulator_zip);
            const simFileName = basename(options.ios_simulator_zip);
            const simBlob = new Blob([simBuffer]);
            formData.append("ios_simulator_zip", simBlob, simFileName);
        }
        return this.request("POST", `/api/users/${ownerName}/apps`, { formData });
    }
    // --- Distribution management ---
    async createDistribution(ownerName, platform, appId, params) {
        return this.request("POST", `/api/users/${ownerName}/platforms/${platform}/apps/${appId}/distributions`, { body: params });
    }
    async listDistributions(ownerName, platform, appId) {
        return this.request("GET", `/api/users/${ownerName}/platforms/${platform}/apps/${appId}/distributions`);
    }
    async getDistribution(accessKey) {
        return this.request("GET", `/api/distributions/${accessKey}`);
    }
    async updateDistribution(accessKey, params) {
        return this.request("PUT", `/api/distributions/${accessKey}`, {
            body: params,
        });
    }
    async deleteDistribution(accessKey) {
        return this.request("DELETE", `/api/distributions/${accessKey}`);
    }
    // --- iOS UDIDs ---
    async getUdids(ownerName, appId) {
        return this.request("GET", `/api/users/${ownerName}/platforms/ios/apps/${appId}/udids`);
    }
    // --- Workspace member management ---
    async addWorkspaceMember(workspace, user) {
        return this.request("POST", `/api/enterprises/${workspace}/users`, {
            body: { user },
        });
    }
    async removeWorkspaceMember(workspace, user) {
        return this.request("DELETE", `/api/enterprises/${workspace}/users/${user}`);
    }
    // --- Project member management ---
    async addProjectMember(workspace, project, user) {
        return this.request("POST", `/api/enterprises/${workspace}/organizations/${project}/users`, { body: { user } });
    }
    async removeProjectMember(workspace, project, user) {
        return this.request("DELETE", `/api/enterprises/${workspace}/organizations/${project}/users/${user}`);
    }
    // --- Team member management ---
    async addTeamMember(project, team, user) {
        return this.request("POST", `/api/organizations/${project}/teams/${team}/users`, { body: { user } });
    }
    async listTeamMembers(project, team) {
        return this.request("GET", `/api/organizations/${project}/teams/${team}/users`);
    }
    async removeTeamMember(project, team, user) {
        return this.request("DELETE", `/api/organizations/${project}/teams/${team}/users/${user}`);
    }
    // --- App team assignment ---
    async assignTeamToApp(project, platform, appId, team) {
        return this.request("POST", `/api/organizations/${project}/platforms/${platform}/apps/${appId}/teams`, { body: { team } });
    }
    // --- Shared teams ---
    async createSharedTeam(workspace, name) {
        return this.request("POST", `/api/enterprises/${workspace}/sharedteams`, {
            body: { name },
        });
    }
    async addSharedTeamMember(workspace, sharedTeamId, params) {
        return this.request("POST", `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users`, { body: params });
    }
    async listSharedTeamMembers(workspace, sharedTeamId) {
        return this.request("GET", `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users`);
    }
    async removeSharedTeamMember(workspace, sharedTeamId, userId) {
        return this.request("DELETE", `/api/enterprises/${workspace}/shared_teams/${sharedTeamId}/users/${userId}`);
    }
    async assignSharedTeamToApp(project, platform, appId, team) {
        return this.request("POST", `/api/organizations/${project}/platforms/${platform}/apps/${appId}/sharedteams`, { body: { team } });
    }
}
//# sourceMappingURL=client.js.map