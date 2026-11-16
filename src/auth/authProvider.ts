import * as vscode from "vscode";

/**
 * Azure DevOps Authentication Provider using Microsoft Entra OAuth
 * Uses VS Code's built-in Microsoft authentication with the user_impersonation scope
 */
export class AzureDevOpsAuthProvider {
	private static readonly AZURE_DEVOPS_RESOURCE_ID = "499b84ac-1321-427f-aa17-267ca6975798";
	private static readonly SCOPES = [
		`${AzureDevOpsAuthProvider.AZURE_DEVOPS_RESOURCE_ID}/user_impersonation`,
	];

	private currentAccount: vscode.AuthenticationSessionAccountInformation | undefined;

	async signIn(): Promise<void> {
		const session = await vscode.authentication.getSession(
			"microsoft",
			AzureDevOpsAuthProvider.SCOPES,
			{ createIfNone: true },
		);

		if (!session) {
			throw new Error("Failed to obtain authentication session");
		}

		this.currentAccount = session.account;
	}

	async signOut(): Promise<void> {
		// Clear the selected account preference
		// Note: VS Code manages authentication sessions centrally
		// Users can fully sign out through VS Code's Accounts menu
		this.currentAccount = undefined;
	}

	async getAccessToken(): Promise<string | null> {
		// VS Code owns token caching and renewal; retained session objects can become stale.
		const session = await vscode.authentication.getSession(
			"microsoft",
			AzureDevOpsAuthProvider.SCOPES,
			{ createIfNone: false, silent: true, account: this.currentAccount },
		);

		this.currentAccount = session?.account;
		return session?.accessToken || null;
	}

	async isAuthenticated(): Promise<boolean> {
		const token = await this.getAccessToken();
		return token !== null;
	}
}
