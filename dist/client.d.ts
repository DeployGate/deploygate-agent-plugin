export interface DeployGateErrorDetail {
    error: true;
    message: string;
    because?: string;
    error_type?: string;
    invalid_params?: Array<{
        field: string;
        reason: string;
    }>;
}
export declare class DeployGateApiError extends Error {
    readonly errorType?: string;
    readonly because?: string;
    readonly invalidParams?: Array<{
        field: string;
        reason: string;
    }>;
    constructor(response: DeployGateErrorDetail);
}
export declare class DeployGateClient {
    private token;
    constructor(token?: string);
    setToken(token: string): void;
    hasToken(): boolean;
    private request;
    getOrganizations(): Promise<unknown>;
    uploadApp(ownerName: string, filePath: string, options?: {
        message?: string;
        distribution_key?: string;
        distribution_name?: string;
        release_note?: string;
        disable_notify?: boolean;
        ios_simulator_zip?: string;
    }): Promise<unknown>;
    createDistribution(ownerName: string, platform: string, appId: string, params: {
        title: string;
        release_note?: string;
        revision?: number;
        active?: boolean;
    }): Promise<unknown>;
    listDistributions(ownerName: string, platform: string, appId: string): Promise<unknown>;
    getDistribution(accessKey: string): Promise<unknown>;
    updateDistribution(accessKey: string, params: {
        title?: string;
        active: boolean;
        release_scope: string;
        passcode?: string;
        release_note?: string;
    }): Promise<unknown>;
    deleteDistribution(accessKey: string): Promise<unknown>;
    getUdids(ownerName: string, appId: string): Promise<unknown>;
    addWorkspaceMember(workspace: string, user: string): Promise<unknown>;
    removeWorkspaceMember(workspace: string, user: string): Promise<unknown>;
    addProjectMember(workspace: string, project: string, user: string): Promise<unknown>;
    removeProjectMember(workspace: string, project: string, user: string): Promise<unknown>;
    addTeamMember(project: string, team: string, user: string): Promise<unknown>;
    listTeamMembers(project: string, team: string): Promise<unknown>;
    removeTeamMember(project: string, team: string, user: string): Promise<unknown>;
    assignTeamToApp(project: string, platform: string, appId: string, team: string): Promise<unknown>;
    createSharedTeam(workspace: string, name: string): Promise<unknown>;
    addSharedTeamMember(workspace: string, sharedTeamId: string, params: {
        email?: string;
        username?: string;
        description?: string;
    }): Promise<unknown>;
    listSharedTeamMembers(workspace: string, sharedTeamId: string): Promise<unknown>;
    removeSharedTeamMember(workspace: string, sharedTeamId: string, userId: string): Promise<unknown>;
    assignSharedTeamToApp(project: string, platform: string, appId: string, team: string): Promise<unknown>;
}
