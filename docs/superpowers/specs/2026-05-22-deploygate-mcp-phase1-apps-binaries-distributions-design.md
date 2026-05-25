# DeployGate MCP フェーズ① 設計: アプリ / バイナリ / 配布ページ管理

- 日付: 2026-05-22
- ステータス: 設計合意済み（実装計画待ち）
- 親ロードマップ: `2026-05-22-deploygate-mcp-full-api-roadmap.md`

## 目的

user・group スコープの **アプリ / バイナリ(リビジョン) / アプリメンバー / 配布ページ追補 / keystore / ユーザー照会** の管理操作を MCP ツールとして追加する。すべて API トークン（Bearer）で駆動可能なものに限定する。

## 対象エンドポイントとツール

パスはすべて `webfront/config/routes.rb` および各コントローラで裏取り済み。`:owner` はユーザー名またはプロジェクト名、`:platform` は `ios|android`。

### 新規モジュール `apps.ts`

| ツール名 | メソッド・パス | パラメータ | 備考 |
|---|---|---|---|
| `get_app` | GET `/api/users/:owner/platforms/:platform/apps/:app_id` | path: owner, platform, app_id / query: revision?(int), key?(string) | アプリ詳細＋バイナリ情報 |
| `list_app_revisions` | GET `.../apps/:app_id/binaries` | path同上 / query: page?(int) | バイナリ一覧（50/page） |
| `get_app_revision` | GET `.../apps/:app_id/binaries/:revision` | path: + revision(int) | 単一リビジョン詳細 |
| `update_app_revision` | PATCH `.../apps/:app_id/binaries/:revision` | body: message?(string) | リビジョンのメモ更新（要 write 権限） |
| `delete_app_revision` | DELETE `.../apps/:app_id/binaries/:revision` | path: + revision | 最新・保護中は削除不可（APIが拒否） |
| `protect_app_revision` | POST `.../apps/:app_id/binaries/:revision/protect` | path: + revision | 自動削除からの保護。上限超過時 409 |
| `unprotect_app_revision` | DELETE `.../apps/:app_id/binaries/:revision/protect` | path: + revision | 保護解除（ルーティング上 DELETE） |
| `search_app_revisions` | GET `.../apps/:app_id/binaries/search` | query: q(string, 必須) | リビジョン検索 |

### 新規モジュール `app-members.ts`

| ツール名 | メソッド・パス | パラメータ | レスポンス要点 |
|---|---|---|---|
| `list_app_members` | GET `.../apps/:app_id/members` | path: owner, platform, app_id | `usage{used,max}`, `users[{name,role}]`, `teams[]`(owner が Gather の場合) |

> **除外（実装後に削除）**: 当初は `invite_app_members`（POST `.../members`）/ `remove_app_members`（DELETE `.../members`）も計画していたが、いずれも **owner が個人ユーザーのアプリにのみ有効**（`application_policy.rb` の `member_addable?`/`tester_addable?` が owner≠User で `false`。Group 所有へ直接 invite すると 403）。個人ユーザー所有アプリがサポートスコープ外と決まったため、この 2 ツールはフェーズ①成果から除外した。ワークスペース／プロジェクトアプリへのアクセス付与は team 経由フロー（ワークスペース招待 → プロジェクト追加 → アプリに attach 済みチームへ追加、または team 作成＋user 追加＋app に attach）＝フェーズ②（チーム/アプリ attach）・③（ワークスペース/プロジェクトメンバー）のツールで行う。`list_app_members` は users と teams の両方を返し owner 種別を問わず有効なため残す。

### 既存 `distributions.ts` の拡張

| ツール名 | メソッド・パス | パラメータ | 備考 |
|---|---|---|---|
| `delete_distribution_by_name` | DELETE `/api/users/:owner/platforms/:platform/apps/:app_id/distributions` | query/body: distribution_name(必須) | 同名複数で 400 / 不在で 404 |
| `update_distribution_revision` | POST `/api/distributions/:access_key/packages` | body: revision(必須, int), release_note?(string) | 配布に割り当てるリビジョン差し替え。デバイストークン拒否＝APIトークン専用 |

加えて既存 `update_distribution` に下記を追加:
- `ip_restriction_enable?`(boolean)
- `ip_restriction?`(string, カンマ区切り CIDR/IP)

### 新規モジュール `keystores.ts`（Android 専用）

| ツール名 | メソッド・パス | パラメータ | 備考 |
|---|---|---|---|
| `get_keystore` | GET `.../apps/:app_id/keystores` | path: owner, app_id | `certificate{md5,sha1,sha256,checksum}` |
| `create_keystore` | POST `.../apps/:app_id/keystores` | なし | デバッグ keystore 自動生成 |
| `update_keystore` | PATCH `.../apps/:app_id/keystores` | multipart: file(必須), alias_name(必須), keystore_password(必須), key_password(必須) | 既存 200 / 新規 201 |
| `delete_keystore` | DELETE `.../apps/:app_id/keystores` | path同上 | |
| `download_keystore` | GET `.../apps/:app_id/keystores/download` | path同上 | `{url, checksum}` |

> keystores は users/apps スコープ内（routes.rb 1311-1317 行）。app パスは `(platforms/:platform_id)/apps` で `platform` 省略時 android がデフォルト。Android 専用機能のため、既存の app スコープツールと同様にパスへ `platforms/android` を含める方針（最終的なパス組み立ては実装時にコントローラで確認）。

### 新規モジュール `users.ts`

| ツール名 | メソッド・パス | パラメータ | 備考 |
|---|---|---|---|
| `get_user` | GET `/api/users/:id` | path: id(username) | ユーザー照会 |

## スコープ外（フェーズ①で扱わない／技術的に不可）

API トークンでは呼べない（デバイストークン必須）ため除外:
- `GET /api/distributions`(全配布一覧 index)
- `distributions/:id/comments`(コメント閲覧・投稿)
- `device_captures#show`
- `platforms/:platform/applications#accessibles`, `platforms/:platform/distributions#joinings`

その他除外:
- `users#registered`（sunset 済み・固定応答）
- プロジェクト / ワークスペース系（フェーズ②・③）

## アーキテクチャ

既存構造を踏襲する。

### `DeployGateClient` への追加メソッド（`src/client.ts`）
- アプリ/リビジョン系: `getApp`, `listAppRevisions`, `getAppRevision`, `updateAppRevision`, `deleteAppRevision`, `protectAppRevision`, `unprotectAppRevision`, `searchAppRevisions`
- アプリメンバー: `listAppMembers`（`inviteAppMembers`/`removeAppMembers` は上記の理由で除外）
- 配布: `deleteDistributionByName`, `updateDistributionRevision`、`updateDistribution` のシグネチャに `ip_restriction_enable` / `ip_restriction` を追加
- keystore: `getKeystore`, `createKeystore`, `updateKeystore`, `deleteKeystore`, `downloadKeystore`
- ユーザー: `getUser`

GET/DELETE/PATCH/POST(form) は既存 `request()` ヘルパを再利用。`update_keystore` のみ `formData`（ファイルアップロード）経路。

### ツール登録（`src/index.ts`）
`registerAppTools`, `registerAppMemberTools`, `registerKeystoreTools`, `registerUserTools` を import・登録に追加。配布の追補は既存 `registerDistributionTools` に追記。

### ツール戻り値
既存同様 `{ content: [{ type: "text", text: JSON.stringify(results, null, 2) }] }`。

## エラー / 破壊的操作

- 破壊的操作（`delete_app_revision`, `delete_keystore`, `delete_distribution_by_name`）は既存 `delete_*` と同様に直接実行。説明文に副作用（最新/保護中は削除不可、保存済みバイナリは保持 等）を明記。
- API 側のドメインエラー（403: 保護上限、400: 同名配布複数、404: 配布/リビジョン不在、422: テスター在席時の authorized_only）は既存 `DeployGateApiError` 経路でそのまま伝播。
- **事前周知の徹底**: 事前バリデーションは行わず、各ツール説明文に前提条件・owner/プラン依存・主要エラー条件・代替手順を明記する（ロードマップ「事前周知の原則」参照）。本フェーズの全ツールで適用済み。

## テスト

- `client.test.ts`: 追加した各 client メソッドが正しい method/path/body で `fetch` を呼ぶことを検証（既存の `vi.fn()` モック流儀）。multipart は `FormData` の組み立てを検証。
- `tools.test.ts`: 新 `register*Tools` を import に追加し、ツール名の登録と必須パラメータの zod バリデーションを検証。
- `bundle.js` は手動再生成しない（release-please が処理）。

## 受け入れ条件

- 上記すべてのツールが登録され、`npm run build && npm test` が通る。
- 各ツールが対応エンドポイントを正しいパス・パラメータで呼ぶ（テストで担保）。
- 既存ツールの挙動に影響を与えない。
