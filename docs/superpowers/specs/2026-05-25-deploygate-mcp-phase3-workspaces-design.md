# DeployGate MCP フェーズ③ ワークスペース（enterprises）管理 — 設計

- 日付: 2026-05-25
- ステータス: 設計合意済み
- 関連: `2026-05-22-deploygate-mcp-full-api-roadmap.md`, `2026-05-25-deploygate-mcp-phase2-projects-design.md`

## 目的

DeployGate 公開 API のうち、**ワークスペース（API 上は enterprises）スコープ**の管理系操作を MCP ツールとして公開する。フルカバレッジ計画の最終段（Phase 3）。

API 実装の裏取り済み（`../deploygate/webfront/app/controllers/api/enterprises/` と `config/routes.rb`）。**全エンドポイントが Bearer API トークンで呼べる**（`api/enterprises/base.rb` の `reject_tester_client_request` によりデバイス/テスタートークンは拒否＝API トークン前提）。一部は **User API トークン限定**（Enterprise トークン不可）であることを各ツールに明記する。

## ツール一覧（計17）

### 新規モジュール `workspace-members.ts`（メンバーライフサイクル, 7ツール）

| ツール | メソッド・パス | パラメータ | 事前周知 |
|---|---|---|---|
| `list_workspace_members` | GET `/api/enterprises/:ws/users` | path: ws | ワークスペース全ユーザー。管理ページ権限が必要（権限なし403/404） |
| `get_workspace_member` | GET `.../users/:id` | path: ws, id | id は name または email（3文字以上）。不在で400 |
| `add_workspace_member` | POST `.../users` | body: user(必須), full_name?, role? | **User トークン限定**。role='guest' でゲスト招待。既加入400(already_joined_member)、招待権限なし403、シート超過403、SSO/flexible ワークスペースは email 必須で400 |
| `remove_workspace_member` | DELETE `.../users/:id` | path: ws, id(name/email) | **User限定・破壊的**。ワークスペースからユーザーを除去。自分自身は除去不可403、非メンバーは400 |
| `get_member_invitation_request` | GET `.../member_invitation_requests/:id` | path: ws, id(display_id) | **User限定**。招待リクエストの状態照会。不在404 |
| `approve_member_invitation_request` | POST `.../member_invitation_requests/:id/approve` | path: ws, id | **User限定**。pending のみ可(400)、シート超過403、ワークスペース既所属ユーザーは処理不可422 |
| `reject_member_invitation_request` | POST `.../member_invitation_requests/:id/reject` | path: ws, id; body: reason? | **User限定**。pending のみ可(400) |

> `add_workspace_member` は既存 client メソッド `addWorkspaceMember(workspace, user)` を `addWorkspaceMember(workspace, user, options?: {full_name?, role?})` へ後方互換拡張して使う（既存 `add_member` オーケストレーションは引数 user のみで呼び続ける）。

### 新規モジュール `workspace-projects.ts`（5ツール）

| ツール | メソッド・パス | パラメータ | 事前周知 |
|---|---|---|---|
| `list_workspace_projects` | GET `.../organizations` | path: ws | ワークスペース配下のプロジェクト一覧。管理権限が必要 |
| `create_project` | POST `.../organizations` | body: owner_name_or_email(必須), name(必須), display_name?, description? | **User限定**。name は3-28文字（英数/ハイフン/アンダースコア、英数で開始終了）かつ**グローバル一意**（重複400）、owner はワークスペースメンバー（不在404）、プランのプロジェクト数上限403。display_name 省略時は name |
| `list_workspace_project_members` | GET `.../organizations/:org/users` | path: ws, org | プロジェクトメンバー一覧。権限なし401/403 |
| `add_project_member` | POST `.../organizations/:org/users` | body: user(必須) | ワークスペース未加入ユーザーは401、権限なし403。※既存 client メソッド `addProjectMember` を公開。team 単位の `add_member`/`list_members` とは別レイヤー（プロジェクト直下のメンバー） |
| `remove_project_member` | DELETE `.../organizations/:org/users/:id` | path: ws, org, id(name/email) | **破壊的**。プロジェクトからユーザーを除去（team 単位の `remove_member` とは別）。非メンバー403、権限なし403。※既存 `removeProjectMember` を公開 |

### 既存 `shared-teams.ts` の拡張（4ツール）

既存の `create_shared_team` / `add_shared_team_member` / `assign_shared_team_to_app` と同居（共有チームのライフサイクルを集約）。

| ツール | メソッド・パス | パラメータ | 事前周知 |
|---|---|---|---|
| `list_shared_teams` | GET `.../shared_teams` | path: ws | ワークスペースの共有チーム一覧。管理権限が必要 |
| `delete_shared_team` | DELETE `.../shared_teams/:id` | path: ws, id(team 名) | **破壊的**。不在400 |
| `list_shared_team_members` | GET `.../shared_teams/:id/users` | path: ws, shared_team_id | ※既存 client メソッド `listSharedTeamMembers` を公開 |
| `remove_shared_team_member` | DELETE `.../shared_teams/:id/users/:id` | path: ws, shared_team_id, user(name/email) | **破壊的**。非メンバー404。※既存 `removeSharedTeamMember` を公開 |

> team 名・user 名は path セグメント。スペースを含み得るため `encodeURIComponent` でエンコードする（Phase 2 の app-team と同方針）。

### 新規モジュール `workspace-saml.ts`（1ツール）

| ツール | メソッド・パス | パラメータ | 事前周知 |
|---|---|---|---|
| `update_saml_certificate` | PUT `.../saml_settings/update_certificate` | multipart: idp_cert ファイル（file_path から読込） | **User限定・admin限定・要注意**: 誤った証明書をアップロードすると SSO ログインが不能になり得る。無効な証明書ファイルで400、非admin/管理権限なし/プラン失効で403、SAML 設定が存在しないと404 |

> マルチパットは Phase 1 の `update_keystore` と同パターン: `readFile(filePath)` → `FormData` に `idp_cert` として append → `request("PUT", path, { formData })`。

## アーキテクチャ（Phase 1/2 踏襲）

### `DeployGateClient` への追加メソッド（`src/client.ts`）
新規11メソッド:
- ワークスペースメンバー: `listWorkspaceMembers`, `getWorkspaceMember`
- プロジェクト: `listWorkspaceProjects`, `createProject`, `listWorkspaceProjectMembers`
- 共有チーム: `listSharedTeams`, `deleteSharedTeam`
- 招待リクエスト: `getMemberInvitationRequest`, `approveMemberInvitationRequest`, `rejectMemberInvitationRequest`
- SAML: `updateSamlCertificate`（multipart / formData 経路）

既存メソッドの変更:
- `addWorkspaceMember`: シグネチャを `(workspace, user, options?: {full_name?, role?})` に後方互換拡張。

既存メソッドをツール公開（client 変更なし）:
- `removeWorkspaceMember`, `addProjectMember`, `removeProjectMember`, `listSharedTeamMembers`, `removeSharedTeamMember`

GET/POST/DELETE/PUT は既存 `request()` を再利用。SAML のみ `formData` 経路。path セグメントの team 名/user 名は `encodeURIComponent`。

### ツール登録（`src/index.ts`）
- `registerWorkspaceMemberTools`, `registerWorkspaceProjectTools`, `registerWorkspaceSamlTools` を新規追加・登録。
- shared-teams の4ツールは既存 `registerSharedTeamTools` に追加。

## 設計原則（事前周知）

- クライアントは値を事前バリデーションせず素通しし、API が enforce した制約違反は `DeployGateApiError`（`message`）でそのまま surface する。
- 各ツール説明文に「前提条件・トークン種別（User限定か）・admin/プラン依存・主要エラー条件（400/401/403/404/422 とその意味）・代替手順」を事前周知。サーバーロジックの二重実装は避ける。
- 破壊系（remove_workspace_member, remove_project_member, delete_shared_team, remove_shared_team_member）と要注意系（update_saml_certificate, approve/reject）は説明文に影響範囲を明記し直接実行。
- ツール戻り値は既存同様 `JSON.stringify(results, null, 2)` のテキストコンテンツ。

## スコープ外（Phase 3 で扱わない）

- SDK/ランタイム/テレメトリ、MDM、Webhook、user_settings、legacy old-organizations 等（ロードマップのスコープ外項目）。
- 共有チームへのメンバー追加（`add_shared_team_member`）・作成（`create_shared_team`）は実装済み（Phase 以前）。
- `createSharedTeam` の `sharedteams`→`shared_teams` パス修正は Phase 2 で完了済み。

## テスト

- `client.test.ts`: 新 client メソッド11種の fetch 呼び出し検証（URL/メソッド/body）。`addWorkspaceMember` 拡張（options 付与時に full_name/role が body に乗ること、未指定時は従来通り）。SAML は formData 経路の検証。`encodeURIComponent` を使う remove 系のエンコード検証。
- `tools.test.ts`: 各 `register*Tools` の登録・パラメータ検証、`createMockClient()` に新メソッドのモック追加、代表ツールのパラメータ素通し検証。
- `bundle.js` は手動再生成しない（release-please が処理）。

## 完了条件

- 新規17ツールが登録される（workspace-members 7, workspace-projects 5, shared-teams 拡張 4, workspace-saml 1）。
- 新規11 client メソッド + `addWorkspaceMember` 拡張 + 既存6メソッドのツール公開。
- `npm run build && npm test` がすべて PASS。
- 全ツールをライブ API で検証（tnj_group / workspace-3vddz、破壊系・要注意系は使い捨て対象＋確認のうえ）。
- `plugin/scripts/bundle.js` は手動再生成しない。
