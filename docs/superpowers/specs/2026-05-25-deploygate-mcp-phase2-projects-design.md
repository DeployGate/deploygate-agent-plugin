# DeployGate MCP フェーズ② プロジェクト（organizations）管理 — 設計

- 日付: 2026-05-25
- ステータス: 設計合意済み
- 関連: `2026-05-22-deploygate-mcp-full-api-roadmap.md`, `2026-05-22-deploygate-mcp-phase1-apps-binaries-distributions-design.md`

## 目的

DeployGate 公開 API のうち、**プロジェクト（API 上は organizations）スコープ**の管理系操作を MCP ツールとして公開する。API トークン（User / Group / Enterprise actor）で駆動できるものに限る。フェーズ①（アプリ/バイナリ/配布/keystore）に続く第2段。

API 実装の裏取り済み（`../deploygate/webfront/app/controllers/api/organizations/` と `config/routes.rb`）。各エンドポイントは Bearer API トークンで呼べ、デバイストークンは不要であることを確認済み。

## 新規ツール（計9）

### 新規モジュール `projects.ts`（プロジェクトレベル操作）

| ツール | メソッド・パス | パラメータ | 事前周知（説明文に明記） |
|---|---|---|---|
| `get_project` | GET `/api/organizations/:project` | path: project | `{id,name,description}`（GroupSerializer）。権限不足で403、プラン失効で401 |
| `update_project` | PATCH `/api/organizations/:project` | body: `display_name?`, `description?` | API の strong params は `display_name`/`description` の両方を許可。バリデーション失敗で400、権限不足で403 |
| `delete_project` | DELETE `/api/organizations/:project` | path: project | **破壊的**。プロジェクトを削除し全招待を無効化。権限不足で403、削除失敗で422 |
| `list_project_apps` | GET `/api/organizations/:project/apps` | path: project | actor から可視のアプリのみ返す（`applications_visible_to`）。権限不足で403 |
| `list_project_members` | GET `/api/organizations/:project/members` | path: project | プロジェクトの全ユーザー（`group.users`）。権限不足で403 |

> 注: `update_project` はロードマップでは description のみだったが、コントローラの `update_params`（`organizations_controller.rb`）が `display_name` も許可するため両方を公開する。クライアントは値を素通しし、API がバリデーションする。

### `app-members.ts` 拡張（アプリへのアクセス制御を集約）

アプリに「誰が／どのチームが」アクセスできるかを 1 モジュールに集約する（既存 `list_app_members` と同居）。

| ツール | メソッド・パス | パラメータ | 事前周知 |
|---|---|---|---|
| `list_app_teams` | GET `.../apps/:app_id/teams` | path: owner, platform, app_id | アプリに attach された**通常チーム**（shared を除く）。権限不足で403 |
| `remove_app_team` | DELETE `.../apps/:app_id/teams/:team` | path: + team | **破壊的**。アプリからチームを detach。owner チームは外せない（400/403）。チーム不在で400 |
| `list_app_shared_teams` | GET `.../apps/:app_id/shared_teams` | path: owner, platform, app_id | アプリに attach された**共有チーム**。**Enterprise 組織専用**（非 Enterprise は400）。権限不足で403 |
| `remove_app_shared_team` | DELETE `.../apps/:app_id/shared_teams/:team` | path: + team | **破壊的**・**Enterprise 専用**。共有チームを detach。owner チーム不可。非 Enterprise / 不在で400 |

> パス: `/api/organizations/:project(/platforms/:platform)/apps/:app_id/...`。owner（project）名を path に取る。フェーズ① app 系ツールと同じく `owner_name`/`platform`/`app_id` を受ける。
> `remove_app_team`/`remove_app_shared_team` の API ルート上の team セグメントは `:id`（チーム名、制約 `/([^\/])+/`）。

## 既存ツールの拡張

- **`list_members`**（`members.ts`）: `team` パラメータを `z.enum(["owner","developer","tester"])` から `z.string()` に変更。これにより**カスタムチーム名**も一覧可能になる（API ルート `teams/:team_id/users` の制約は `/.+/`）。説明文に「`owner`/`developer`/`tester` は既定チーム、それ以外はプロジェクトのカスタムチーム名」と明記。`listTeamMembers` client メソッドは変更不要。
  - ロードマップの `list_team_members` は本拡張に統合し、新規ツールとしては作らない（重複回避）。

## バグ修正（ライブ検証込み）

既存 client メソッドに `sharedteams`（アンダースコアなし）の誤ったパスが2箇所ある。API は一貫して `shared_teams` を使う（routes.rb・他メソッドすべて）。両方を修正し、ライブ API で疎通確認する。

- `client.ts` `createSharedTeam`: `/api/enterprises/${workspace}/sharedteams` → `/api/enterprises/${workspace}/shared_teams`
- `client.ts` `assignSharedTeamToApp`: `.../apps/${appId}/sharedteams` → `.../apps/${appId}/shared_teams`

> フェーズ①の keystore 教訓（routes.rb と本番でパスが異なり得る）に倣い、ロードマップ上は createSharedTeam=フェーズ③だったが、関連バグなので**両方フェーズ②で修正**し、ライブ検証で確定する。

## アーキテクチャ（フェーズ①踏襲）

### `DeployGateClient` への追加メソッド（`src/client.ts`）
- プロジェクト: `getProject`, `updateProject`, `deleteProject`, `listProjectApps`, `listProjectMembers`
- アプリチーム: `listAppTeams`, `removeAppTeam`, `listAppSharedTeams`, `removeAppSharedTeam`
- 既存修正: `createSharedTeam`, `assignSharedTeamToApp` のパス

GET/DELETE/PATCH は既存 `request()` を再利用。新たな multipart 経路は不要。

### ツール登録（`src/index.ts`）
- `registerProjectTools(server, client)` を新規追加・登録。
- `registerAppMemberTools` に app team/shared-team の4ツールを追加。
- `list_members` の拡張は `members.ts` 内で完結。

## 設計原則（事前周知）

- クライアントは値を事前バリデーションせず素通しし、API が enforce した制約違反は `DeployGateApiError`（`message`）でそのまま surface する。
- 各ツール説明文に「前提条件・owner/プラン依存・主要エラー条件（400/401/403/422 とその意味）・代替手順」を事前周知として明記。サーバーロジックの二重実装は避ける（drift 防止）。
- 破壊系（`delete_project`, `remove_app_team`, `remove_app_shared_team`）は既存 `delete_*` 同様に直接実行。説明文に影響範囲を明記。
- ツール戻り値は既存同様 `JSON.stringify(results, null, 2)` のテキストコンテンツ。

## スコープ外（フェーズ②で扱わない）

- ワークスペース（enterprises）系ツール → フェーズ③。
- プロジェクトメンバーの追加/削除オーケストレーション（既存 `add_member`/`remove_member` でカバー済み）。
- `list_team_members` 単独ツール（`list_members` 拡張に統合）。

## テスト

- `client.test.ts`: 新 client メソッド9種の fetch 呼び出し検証（URL/メソッド/body）。`createSharedTeam`/`assignSharedTeamToApp` の修正後パスを検証するよう既存テストを更新。
- `tools.test.ts`: `registerProjectTools` の登録・パラメータ検証、`app-members.ts` 追加4ツールの登録、`list_members` の team が任意文字列を受けることの検証。`createMockClient()` に新メソッドのモックを追加。
- `bundle.js` は手動再生成しない（release-please が処理）。

## 完了条件

- 新規9ツール（get_project, update_project, delete_project, list_project_apps, list_project_members, list_app_teams, remove_app_team, list_app_shared_teams, remove_app_shared_team）が登録される。
- `list_members` がカスタムチーム名を受け付ける。
- `createSharedTeam`/`assignSharedTeamToApp` のパスが `shared_teams` に修正され、ライブ検証で疎通確認される。
- `npm run build && npm test` がすべて PASS。
- `plugin/scripts/bundle.js` は手動再生成しない。
