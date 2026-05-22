# DeployGate MCP: 公開APIフルカバレッジ ロードマップ

- 日付: 2026-05-22
- ステータス: 設計合意済み（フェーズ分割で進行）
- 関連: `2026-05-22-deploygate-mcp-phase1-apps-binaries-distributions-design.md`

## 目的

DeployGate の公開 REST API のうち、**MCP の API トークン（Bearer）で駆動できる管理系操作すべて**を MCP ツールとして公開する。現状の MCP は upload / 配布ページ CRUD / メンバー・チーム管理の一部のみをカバーしている。

## スコープの原則

含める / 除外するの判断基準を明確化する。

### 含める
- API トークン（User / Group(プロジェクト) / Enterprise(ワークスペース) いずれかの actor）で呼べる管理系操作。
- ドキュメント記載の有無を問わず、上記を満たす公開ルート（例: index/show/destroy の兄弟ルート、keystores）。

### 除外
- **デバイス（テスター端末）トークン必須のルート**。API トークンでは呼べない（`current_device_filter` 等）。
  該当: `GET /api/distributions`(index), `distributions/:id/comments`(コメント), `device_captures#show`,
  `platforms/:platform/applications#accessibles`, `platforms/:platform/distributions#joinings`。
- SDK/ランタイム/テレメトリ系: `install`/`uninstall`/`report`/`log`/`review`、`devices` 登録、`device_capture_assets`、`cli_websockets`、`install_sessions`。
- MDM / Webhook / 認証UI系: `configuration_profiles`, `callbacks#bounces`, `email_verification`, `comment_mutes`, `user_invitations`, `sessions#info|intercom|terms`, `binary_download_redirect`。
- アカウント自己管理: `user_settings`（プロフィール更新・パスワード変更）、`external/extended_distributions`。
- レガシー重複API: `/api/old-group/*`（old-organizations 系。新 `/api/organizations/*` で代替）。
- `users#registered`（sunset 済み・固定応答）。

> 認証根拠: `app/controllers/api/base.rb` の `authenticated?` / `current_device` / `current_device_filter`。
> Bearer トークンは actor（User/Group/Enterprise）にマップされ、テスター端末アクションには紐づかない。

## フェーズ分割

各フェーズが独立した spec → plan → 実装サイクルを持つ。

### フェーズ① アプリ / バイナリ / 配布ページ管理（user・group スコープ）
新規ツール群: `apps.ts`, `app-members.ts`, `keystores.ts`、`distributions.ts` 拡張、`users.ts`。
詳細は Phase 1 spec を参照。

### フェーズ② プロジェクト（organizations）管理
- `get_project` GET `/api/organizations/:project`
- `update_project` PATCH `/api/organizations/:project`（description）
- `delete_project` DELETE `/api/organizations/:project`
- `list_project_apps` GET `/api/organizations/:project/apps`
- `list_project_members` GET `/api/organizations/:project/members`
- `list_team_members` GET `/api/organizations/:project/teams/:team/users`（既存 client メソッド `listTeamMembers` を公開）
- `list_app_teams` GET `/api/organizations/:project/platforms/:platform/apps/:app_id/teams`
- `remove_app_team` DELETE `.../teams/:team`
- `list_app_shared_teams` GET `.../apps/:app_id/shared_teams`
- `remove_app_shared_team` DELETE `.../shared_teams/:team`
- 横断修正: `assignSharedTeamToApp` のパス `sharedteams` → `shared_teams`。

### フェーズ③ ワークスペース（enterprises）管理
- `list_workspace_members` GET `/api/enterprises/:ws/users`
- `get_workspace_member` GET `/api/enterprises/:ws/users/:id`
- `create_project` POST `/api/enterprises/:ws/organizations`（owner, name, display_name, description）
- `list_workspace_projects` GET `/api/enterprises/:ws/organizations`
- `list_workspace_project_members` GET `/api/enterprises/:ws/organizations/:project/users`
- `list_shared_teams` GET `/api/enterprises/:ws/shared_teams`
- `delete_shared_team` DELETE `/api/enterprises/:ws/shared_teams/:team`
- `list_shared_team_members` GET `.../shared_teams/:id/users`（既存 client メソッド `listSharedTeamMembers` を公開）
- `update_saml_certificate` PUT `/api/enterprises/:ws/saml_settings/update_certificate`（idp_cert ファイル / multipart。認証ダウンタイム警告を説明文に記載）
- `get_member_invitation_request` / `approve_member_invitation_request` / `reject_member_invitation_request`（要: 計画時に認証要件を確認）
- 横断修正: `createSharedTeam` のパス `sharedteams` → `shared_teams`。

## 共通の実装方針

- 既存パターン踏襲: 各モジュールが `register*Tools(server, client)` をエクスポートし `src/index.ts` で登録。
- `DeployGateClient` に各エンドポイント用メソッドを追加。GET/DELETE/PATCH/PUT は既存 `request()` を再利用。multipart（keystore 更新, SAML 証明書）は `formData` 経路。
- ツール戻り値は既存同様 `JSON.stringify(results, null, 2)` のテキストコンテンツ。
- 破壊的操作は既存 `delete_*` と同様に直接実行。説明文に影響範囲を明記。
- 各エンドポイントの正確なパラメータ・レスポンスは実装ソース `webfront/app/controllers/api/` で裏取り済み（または計画時に確認）。

## テスト

- `client.test.ts`: 新 client メソッドの fetch 呼び出し検証（`vi.fn()` モック）。
- `tools.test.ts`: 新ツールの登録・パラメータ検証。各 `register*Tools` を import に追加。
- `bundle.js` は手動再生成しない（release-please が処理）。
