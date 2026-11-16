import * as assert from "node:assert";
import { setup, suite, teardown, test } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { AzureDevOpsAuthProvider } from "../../../auth/authProvider";

suite("AzureDevOpsAuthProvider", () => {
	let authProvider: AzureDevOpsAuthProvider;
	let getSessionStub: sinon.SinonStub;

	setup(() => {
		authProvider = new AzureDevOpsAuthProvider();
		getSessionStub = sinon.stub(vscode.authentication, "getSession");
	});

	teardown(() => {
		sinon.restore();
	});

	suite("signIn", () => {
		test("should sign in successfully with valid session", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-access-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			await authProvider.signIn();

			assert.ok(getSessionStub.calledOnce);
			assert.ok(
				getSessionStub.calledWith("microsoft", [
					"499b84ac-1321-427f-aa17-267ca6975798/user_impersonation",
				]),
			);
		});

		test("should throw error when authentication fails", async () => {
			getSessionStub.resolves(null);

			await assert.rejects(
				async () => {
					await authProvider.signIn();
				},
				{
					name: "Error",
					message: "Failed to obtain authentication session",
				},
			);
		});

		test("should use createIfNone option to prompt user", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-access-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			await authProvider.signIn();

			const callArgs = getSessionStub.firstCall.args;
			assert.strictEqual(callArgs[2]?.createIfNone, true);
		});
	});

	suite("signOut", () => {
		test("should clear the selected account preference", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-access-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);
			await authProvider.signIn();

			const tokenBefore = await authProvider.getAccessToken();
			assert.strictEqual(tokenBefore, "test-access-token");

			await authProvider.signOut();

			// After sign out, getAccessToken should try to get a silent session
			getSessionStub.resolves(null);
			const tokenAfter = await authProvider.getAccessToken();
			assert.strictEqual(tokenAfter, null);
			assert.strictEqual(getSessionStub.lastCall.args[2]?.account, undefined);
		});

		test("should not throw error when signing out without active session", async () => {
			await assert.doesNotReject(async () => {
				await authProvider.signOut();
			});
		});
	});

	suite("getAccessToken", () => {
		test("should use the refreshed Microsoft token after signing in", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "expired-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);
			await authProvider.signIn();

			getSessionStub.resolves({ ...mockSession, accessToken: "refreshed-token" });

			const token = await authProvider.getAccessToken();
			assert.strictEqual(token, "refreshed-token");
			assert.strictEqual(getSessionStub.lastCall.args[2]?.silent, true);
			assert.deepStrictEqual(getSessionStub.lastCall.args[2]?.account, mockSession.account);
		});

		test("should fetch a token when no account has been selected", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "new-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			const token = await authProvider.getAccessToken();
			assert.strictEqual(token, "new-token");
			assert.ok(getSessionStub.calledOnce);
		});

		test("should return null when no session is available", async () => {
			getSessionStub.resolves(null);

			const token = await authProvider.getAccessToken();
			assert.strictEqual(token, null);
		});

		test("should use silent authentication", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			await authProvider.getAccessToken();

			const callArgs = getSessionStub.firstCall.args;
			assert.strictEqual(callArgs[2]?.createIfNone, false);
			assert.strictEqual(callArgs[2]?.silent, true);
		});

		test("should use the refreshed Microsoft token after silent authentication", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "silent-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			const token1 = await authProvider.getAccessToken();
			assert.strictEqual(token1, "silent-token");

			getSessionStub.resolves({ ...mockSession, accessToken: "refreshed-token" });

			const token2 = await authProvider.getAccessToken();
			assert.strictEqual(token2, "refreshed-token");
			assert.deepStrictEqual(getSessionStub.lastCall.args[2]?.account, mockSession.account);
		});

		test("should not reuse a token when the Microsoft session is removed", async () => {
			getSessionStub.resolves({
				id: "test-session-id",
				accessToken: "expired-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			} satisfies vscode.AuthenticationSession);
			await authProvider.signIn();

			getSessionStub.resolves(undefined);

			assert.strictEqual(await authProvider.getAccessToken(), null);
			assert.strictEqual(await authProvider.isAuthenticated(), false);
		});

		test("should surface session refresh errors instead of reusing a stale token", async () => {
			getSessionStub.resolves({
				id: "test-session-id",
				accessToken: "expired-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			} satisfies vscode.AuthenticationSession);
			await authProvider.signIn();

			const error = new Error("Microsoft session refresh failed");
			getSessionStub.rejects(error);

			await assert.rejects(() => authProvider.getAccessToken(), error);
		});
	});

	suite("isAuthenticated", () => {
		test("should return true when access token is available", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			const isAuth = await authProvider.isAuthenticated();
			assert.strictEqual(isAuth, true);
		});

		test("should return false when no access token is available", async () => {
			getSessionStub.resolves(null);

			const isAuth = await authProvider.isAuthenticated();
			assert.strictEqual(isAuth, false);
		});

		test("should return true after successful sign in", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);

			await authProvider.signIn();

			const isAuth = await authProvider.isAuthenticated();
			assert.strictEqual(isAuth, true);
		});

		test("should return false after sign out", async () => {
			const mockSession: vscode.AuthenticationSession = {
				id: "test-session-id",
				accessToken: "test-token",
				account: { id: "user-id", label: "Test User" },
				scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"],
			};

			getSessionStub.resolves(mockSession);
			await authProvider.signIn();

			await authProvider.signOut();

			getSessionStub.resolves(null);

			const isAuth = await authProvider.isAuthenticated();
			assert.strictEqual(isAuth, false);
		});
	});
});
