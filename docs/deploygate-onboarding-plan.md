# DeployGate オンボーディング自動化 計画書

> Claude / Claude Code からDeployGateのセットアップと全機能の活用をガイドするプロジェクト

---

## 1. 現状分析

### 1.1 アカウント体系

DeployGateのリソース階層は以下の通り。

```
Workspace (Enterprise)
├── Shared Teams (workspace単位、複数作成可能)
│   └── 例: "all staff" (全社員)
│       → Project側からtester権限のチームとして参照可能
│       → ドッグフーディング等の大規模配布に活用
│
├── Project (Group)  ← workspace作成時にデフォルトで1つ作成される
│   ├── App (platform: ios / android)
│   │   ├── Revisions (アップロード履歴)
│   │   ├── Distribution Pages (配布ページ)
│   │   │   └── Instant Device: Web上でアプリのプレビュー可能（端末不要）
│   │   └── Teams (アクセス権) ← デフォルトでownerチームがアサイン済み
│   │
│   └── Teams (project単位、複数作成可能)
│       ├── owner    ← フル権限
│       ├── developer ← 更新可能、新規アプリ作成・削除・メンバー管理は不可
│       └── tester   ← 閲覧・インストールのみ
│
└── Members (workspace単位)
```

**チームの2つのスコープ:**
- **Projectチーム**: Project単位で作成・管理。owner/developer/testerのロールを持つ
- **共有チーム（Shared Teams）**: Workspace単位で作成・管理。複数のProject横断で使える。Project側からはtester権限のチームとして参照可能。例えば全社員チームを1つ作り、各Projectのアプリにアサインすることでドッグフーディングを効率化できる

**メンバー追加の流れ（3ステップ）:**
1. **Workspace に追加**: `POST /api/enterprises/{WORKSPACE}/users`
2. **Project に追加**: `POST /api/enterprises/{WORKSPACE}/organizations/{PROJECT}/users`
3. **Team に追加**: `POST /api/organizations/{PROJECT}/teams/{TEAM}/users`

**テスターの場合は追加で:**
4. **tester チームにアプリをアサイン**: `POST /api/organizations/{PROJECT}/platforms/{PLATFORM}/apps/{APP_ID}/teams` （testerチームはデフォルトではアプリにアサインされていないため）

### 1.2 既存APIの対応状況

調査の結果、DeployGateは以下のREST APIを公開している（`docs.deploygate.com/llms-full.txt` より）。

| カテゴリ | 主なエンドポイント | 状況 |
|---|---|---|
| アプリアップロード | `POST /api/users/{USER_ID}/apps` | ✅ 利用可能 |
| アプリ詳細・リビジョン管理 | `GET/DELETE` 各種 | ✅ 利用可能 |
| 配布ページ CRUD | `POST/GET/PUT/DELETE /api/.../distributions` | ✅ 利用可能 |
| 配布ページのリビジョン更新 | `POST /api/distributions/{ID}/packages` | ✅ 利用可能 |
| アプリメンバー管理（レガシー） | `POST/GET/DELETE /api/.../members` | ✅ 利用可能 |
| チーム管理 | `POST/GET/DELETE /api/.../teams` | ✅ 利用可能 |
| プロジェクト管理 | 各種 CRUD | ✅ 利用可能 |
| ワークスペース管理 | 各種 CRUD（Enterprise） | ✅ 利用可能 |
| ワークスペースメンバー管理 | `POST/GET/DELETE /api/enterprises/.../users` | ✅ 利用可能 |
| プロジェクトメンバー管理 | `POST/GET/DELETE /api/enterprises/.../organizations/.../users` | ✅ 利用可能 |
| チームメンバー管理 | `POST/GET/DELETE /api/organizations/.../teams/.../users` | ✅ 利用可能 |
| 共有チームメンバー管理 | `POST/GET/DELETE /api/enterprises/.../shared_teams/.../users` | ✅ 利用可能（ドキュメント未整備） |
| iOS UDIDリスト取得 | `GET /api/users/*/platforms/ios/apps/*/udids` | ✅ 既存（非公開ドキュメント） |
| **アカウント作成** | — | ❌ APIなし |
| **Slack通知連携の設定** | — | ❌ APIなし（UI操作のみ） |
| **通知設定（Webhook URL登録）** | — | ❌ APIなし |
| **GitHub連携設定** | — | ❌ APIなし |

### 1.3 CLIツールの状況

- **deploygate-cli（`dg`コマンド）**: メンテナンス終了。API利用を推奨
- **dgate**: アーカイブ済み（2019年）

→ CLIへの依存は避け、**APIベースの自動化**を前提とするのが妥当。

### 1.4 SDK

- **Android SDK**: v4.7.1+、クラッシュレポート・リモートLogCat・キャプチャ機能など
- **iOS SDK**: クラッシュレポート・リモートログ・バージョン通知など

→ SDKの追加はコードベースへの変更であり、ガイド＋コード生成で対応。

---

## 2. オンボーディングステップの全体設計

### 2.1 設計方針: 最短パスから段階的に拡張

オンボーディングは**最短で価値を体験できるパス**を最初に提示し、そこからユーザーのニーズに応じて段階的に機能を追加していく設計とする。

**最短パス（〜10分で完了）:**
```
サインアップ → アプリアップロード → 配布ページ作成 → Slack通知連携 → リンク共有
```
配布ページの**Instant Device機能**により、共有先は端末がなくてもWebブラウザでアプリの動作を確認できる。

**配布ページの公開範囲設定（`release_scope`、4段階）:**
- **`public`**: 公開（検索エンジンにもインデックス可能）
- **`unlisted`**: 限定公開 — リンクを知っている人のみ（デフォルト）
- **`passcode`**: 合言葉が必要（`passcode` パラメータ必須）
- **`authorized_only`**: アプリにアクセスできるチームメンバーのみ

**配布ページ vs メンバー追加の違い:**
- **配布ページ経由**: クライアントでは配布ページごとに指定された最新ビルドのみが見える
- **メンバーとして追加**: クライアントで過去のすべてのリビジョン（プランによって数の制限あり）を選択してインストール可能

**段階的拡張:**
最短パスで価値を体験した後、アクセス制御・チーム管理・CI/CD・SDK統合へと進む。

### 2.2 Phase 1 の完了定義

Phase 1 のゴールは「配布ができること」。これは単にリンクを共有するだけでなく、**テスターが実際にアプリを利用できる状態になるまで**を意味する。

- **Instant Deviceで十分な場合**: 配布ページのInstant Deviceでアプリが起動できるまで
- **実機インストールが必要な場合**: テスターの端末にアプリがインストールされ、起動できるまで

iOSのAd Hocビルドの場合、テスターの端末UDIDがProvisioning Profileに含まれていないとインストールできないため、UDID追加→再ビルド→再アップロードまでがPhase 1の範囲に含まれる。

### 2.3 フェーズ構成

```
Phase 1: 配布の完了 — テスターがアプリを利用できる状態にする
  Step 1.  アカウント作成（サインアップ + APIキー取得）
  Step 2.  アプリのアップロード（デフォルトProjectへ）
  Step 3.  配布ページの作成とリンク共有
  Step 4.  配布ページのSlack/Teams/Chatwork通知連携
  Step 5.  [iOS Ad Hoc] テスターUDIDの取得と追加
  ── 完了条件: テスターがアプリを起動できる（Instant Device or 実機）──

Phase 2: CI/CD統合 — 開発者の手を空け、テスターが自律的にビルドを取得できるようにする
  Step 6. CIからのアップロード（GitHub Actions: deploygate-upload-github-action）
  Step 7. GitHub PR → 配布ページ自動作成・デプロイ状態反映（クローズ時に自動削除）

Phase 3: 開発統合
  Step 8. SDKの追加（Android / iOS）

Phase 4: 動作確認
  Step 9. 各ステップの動作確認

Phase 5: チーム拡大（Flexibleプラン以上）
  Step 10. 配布ページの公開範囲設定（合言葉 / メンバー限定）
  Step 11. メンバーの追加（開発者 / テスター）
  Step 12. 共有チームによる大規模配布（ドッグフーディング等）
```

> **Phase 1 にUDID追加を含める理由:** iOS Ad Hocの場合、テスターが配布リンクを開いてもUDIDがProvisioning Profileに含まれていなければインストールできない。「配布ができた」と言える状態にするには、UDIDの登録から再ビルド・再アップロードまでを完了する必要がある。Androidの場合やInstant Deviceのみの場合はStep 5をスキップする。
>
> **Phase 2 を早期に置く理由:** Phase 1で配布体験を得た直後にCI/CDを組み込むことで、開発者はビルド・配布作業から解放される。テスターは配布ページ経由で常に最新ビルドを自主的にインストールできる状態になり、チーム全体の開発サイクルが加速する。
>
> **Phase 5 を後方に置く理由:** Freeプランではメンバー上限が2名（自分+1名）のため、メンバー追加・チーム管理・共有チームはオンボーディングの必須ステップではない。Flexibleプラン以上に契約した後に、チーム拡大のステップとして案内する。配布ページの公開範囲設定（合言葉）はFreeプランでも利用可能だが、メンバー限定設定はメンバー追加と組み合わせて意味を持つため、同じPhaseにまとめている。

---

## 3. 各ステップの詳細と実現手段

### Step 1. アカウント作成

| 項目 | 内容 |
|---|---|
| 既存API | ❌ なし |
| 実現手段 | ガイド表示 → ブラウザで手動作成 → APIキーの取得をガイド |
| 必要な新規開発 | なし（手動ステップとして許容） |
| 代替案 | アカウント作成APIの新規開発（優先度: 低） |

**サインアップURL:** https://deploygate.com/app/register/signup
**APIキー確認:** https://deploygate.com/settings

APIキーはその後のすべてのステップで必要になるため、最初に確実に取得させる。

**トークン設定（実装済み）:**

MCPサーバーはトークン未設定でも起動可能。オンボーディング中に `set_api_token` MCPツールでトークンを動的に設定できる。トークン設定時に自動的に `GET /api/organizations` を呼び出して検証し、成功すればユーザー情報を返す。

トークン解決の優先順位:
1. `set_api_token` で設定された値（セッション中のみ有効）
2. 環境変数 `DEPLOYGATE_API_TOKEN`

**ユーザー情報の取得方法（検証結果による制約）:**

`/api/users/me` のようなトークンから直接ユーザー情報を返すAPIは存在しない。MCPサーバーは以下の方法でユーザー情報を推定する:
1. `GET /api/organizations` — トークンの所有ユーザーに紐づく組織一覧を取得
2. 組織一覧からワークスペース名・デフォルトプロジェクト名を推定
3. 認証方式は `Authorization: Bearer {token}` ヘッダーを使用

### Step 2. アプリのアップロード

| 項目 | 内容 |
|---|---|
| 既存API | ✅ `POST /api/users/{USER_ID}/apps` |
| パラメータ | `file`（必須）、`message`、`distribution_key`（=`access_key`）、`distribution_name`、`release_note`、`disable_notify`、`ios_simulator_zip`（iOS Instant Device用） 等 |
| 認証 | `Authorization: Bearer {token}` ヘッダー |
| レスポンス | `{"error": false, "results": {...}}` 形式。配布ページ指定時は `results.distribution.access_key` を含む |
| 実現手段 | **MCPツール** でファイルパスを受け取り、APIを呼ぶ |
| 前提条件 | アプリはWorkspace内のProject（デフォルトProject）にアップロードされる |
| 動作確認 | アップロード後に `GET` でアプリ詳細を取得し確認 |

**`distribution_name` と `distribution_key` の優先順位:**
- 両方指定した場合、`distribution_key` が優先され `distribution_name` は無視される
- `distribution_name` で配布ページが新規作成される場合、`active: false` で作成される

**`message` パラメータの活用:**

アップロード時に `message` を付けることでビルドの検索性が大幅に向上する。最大 32,766 バイトで自動切り詰め（超過時はレスポンスに警告）。スキルはGit情報を自動検出し、以下のような内容を自動生成する。

- ブランチ名: `feature/new-login`
- コミットハッシュ: `abc1234`
- PRの場合: `PR #123: ログイン画面のリニューアル`

例: `message = "feature/new-login (abc1234)"` or `message = "PR #123: ログイン画面のリニューアル (abc1234)"`

**アップロード対象ファイルの取得方法:**

スキルはプロジェクト構成を検出し、適切なビルド手順をガイドする。

**Android（APK / AAB）:**

方法1: Gradleで直接ビルド
```bash
./gradlew assembleDebug    # APK
./gradlew bundleDebug      # AAB
```
> **注意:** Android StudioのInstant Runや差分ビルド（Apply Changes）で端末に転送されるAPKは不完全なため使用不可。`assembleDebug` 等のGradleタスクで生成されたフルビルドのファイルをアップロードする。

出力先の例:
- APK: `app/build/outputs/apk/debug/app-debug.apk`
- AAB: `app/build/outputs/bundle/debug/app-debug.aab`

方法2: gradle-deploygate-plugin（ビルド＋アップロードを一括実行）
```bash
# プラグイン導入後、以下のコマンドでビルドからアップロードまで完了する
./gradlew uploadDeployGateDebug
```
[DeployGate/gradle-deploygate-plugin](https://github.com/DeployGate/gradle-deploygate-plugin) を `build.gradle` に追加することで利用可能。ローカル開発中はこちらが手軽。

**iOS（IPA）:**

方法1: fastlane
```bash
fastlane gym --scheme "MyApp" --export_method "development"
```

方法2: Xcode
```
Xcode → Product → Archive → Distribute App → Development → Export
```

いずれの方法でもエクスポートされたIPAファイルをアップロードする。署名済みのIPAが必要であり、Provisioning Profileが正しく設定されている必要がある。

**`ios_simulator_zip` パラメータ（Instant Device用、任意）:**

iOS Instant Device（ブラウザ上でのアプリプレビュー）を有効にするには、IPAに加えてシミュレーター用ビルドの zip をアップロードする。IPAは常に必須 — シミュレーター zip 単体ではアップロード不可。

```bash
xcodebuild -scheme "MyApp" -sdk iphonesimulator -configuration Debug -derivedDataPath build
cd build/Build/Products/Debug-iphonesimulator
zip -r MyApp-simulator.zip MyApp.app
```

fastlane を使う場合は `xcodebuild` アクション + `zip` アクションを lane にまとめる。

### Step 3. 配布ページの作成とリンク共有

アプリをアップロードしたら、配布ページを作成してリンクを共有する。

| 項目 | 内容 |
|---|---|
| 既存API | ✅ `POST /api/users/{USER_ID}/platforms/{PLATFORM}/apps/{APP_ID}/distributions` |
| パラメータ | `title`（配布ページ名、max 255文字）、`release_note`（任意）、`revision`（任意）、`active`（任意、デフォルト true） |
| レスポンス | `{"error": false, "results": {...}}` — `results.access_key` が配布ページのキー、URLは `https://deploygate.com/distributions/{access_key}` |
| 実現手段 | APIで作成し、配布URLを返す |
| 動作確認 | `GET .../distributions` でページ一覧を確認 |

**配布ページの特長:**
- **Instant Device機能**: 配布ページ上でWebブラウザからアプリの動作を確認可能。テスターは端末を持っていなくてもよい
- 配布ページ経由では**配布ページごとに指定された最新ビルドのみ**がクライアントに表示される（過去リビジョンの選択はできない）
- デフォルトの公開範囲は「リンクを知っている人のみ」

### Step 4. 配布ページのSlack/Teams/Chatwork通知連携

| 項目 | 内容 |
|---|---|
| 既存API | ❌ なし（ブラウザでの設定が必要） |
| 実現手段 | **ブラウザで通知設定ページを開いてもらうようガイド** |

**配布ページ用の設定URL:**
```
https://deploygate.com/distributions/{DISTRIBUTION_ACCESS_KEY}/notification_settings/new
```

MCPツール / スキルは配布ページの `DISTRIBUTION_ACCESS_KEY` から自動生成し、「このURLをブラウザで開いてください」と案内する。

> **この手順はスキップしないでください。** 通知連携を設定すると以下のメリットがあります:
> - **新しいビルドの反映**がチャットに自動通知される
> - **テスターがアプリをインストールしたとき**にも通知が届き、チームの動きが見える化される
> - CI/CD連携（Step 5以降）と組み合わせると、PRごとのビルド完了がSlack/Teamsに自動通知され、レビューサイクルが大幅に効率化する
>
> 設定自体は1〜2分で完了します。

**ガイドの流れ:**
1. MCPツールがStep 3で作成した配布ページの `DISTRIBUTION_ACCESS_KEY` を取得
2. 上記URLを生成し、ユーザーに提示
3. ユーザーがブラウザで開き、Slack / Teams / Chatwork を選択して連携を完了
4. テストアップロード（Step 2 のMCPツール）を行い、通知が届くことを確認

### Step 5. [iOS] テスター端末でのインストールと起動

iOSの場合、テスターが初めてアプリをインストール・起動する際に、配布方式（Ad Hoc / In-House）やiOSバージョンに応じた追加操作が必要になることがある。スキルはこれらをテスター向けに分かりやすく案内する。

#### 5a. iOS端末の事前準備

**デベロッパーモードの有効化（iOS 16以降、Ad Hocビルドの場合）:**

iOS 16以降の端末にAd Hocビルドをインストールするには、デベロッパーモードを有効にする必要がある。無効の場合、インストールしたアプリを起動できない。

```
1. 設定 → プライバシーとセキュリティ → デベロッパモード → トグルをON
2. 「デベロッパモードを有効にするとセキュリティが低下します」のアラート → 「再起動」をタップ
3. 端末が再起動される
4. ロック解除後、確認アラートが表示される → 「オンにする」をタップ → 端末のパスコードを入力
```

参考: [Enabling Developer Mode on a device | Apple Developer Documentation](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)

> **注意:** デベロッパーモードはIn-House（Enterprise）配布のアプリには不要。

**構成プロファイルのインストール:**

配布ページのリンクをSafariで開くと、DeployGateの構成プロファイルのインストールを求められる。

```
1. Safariで配布リンクを開く（Safari以外のブラウザでは動作しない）
2. 「プロファイルをインストール」のダイアログが表示される
3. 設定 → 一般 → VPNとデバイス管理 → ダウンロード済みプロファイル → インストール
4. 端末のパスコードを入力（DeployGateのパスワードではない）
```

**In-House（Enterprise）アプリの信頼設定:**

In-Houseビルドの場合、初回起動時に「信頼されていないエンタープライズデベロッパ」のダイアログが表示される。

```
設定 → 一般 → VPNとデバイス管理 → エンタープライズApp → デベロッパ名を信頼
```

#### 5b. [Ad Hoc] テスターUDIDの取得と追加

Ad Hocビルドの場合、テスターの端末UDIDがProvisioning Profileに含まれている必要がある。Instant Deviceのみで十分な場合やIn-House配布の場合はこのステップをスキップする。

詳細な手順は「Step 5 補足: UDID管理の詳細仕様」に記載。Phase 1 では以下の流れで実施する。

```
1. テスターに配布ページのリンクを開いてもらう（5aの事前準備を案内）
2. テスターが構成プロファイルをインストール
3. UDIDがProvisioning Profileに含まれていない場合:
   a. DeployGateからメール通知が届く
   b. MCPツール get_udids で is_provisioned: false のデバイスを取得
   c. fastlane で Apple Developer に UDID 登録 → Provisioning Profile 更新
   d. 再アーカイブ・エクスポート → DeployGate に再アップロード
4. テスターがアプリをインストール・起動できることを確認
```

#### Phase 1 の完了条件

テスターが実際にアプリを起動できる状態になっていること。

- **Instant Deviceのみ**: Step 4の完了時点でPhase 1完了
- **Android実機**: Step 4の完了時点でPhase 1完了（通常、追加操作は不要）
- **iOS実機（In-House）**: 5a の端末準備完了＋アプリ起動確認でPhase 1完了
- **iOS実機（Ad Hoc）**: 5a + 5b の完了（UDID登録→再ビルド→再アップロード→インストール確認）でPhase 1完了

---

### Step 6. CIからのアップロード

| 項目 | 内容 |
|---|---|
| 既存API | ✅ `POST /api/users/{USER_ID}/apps`（Step 2と同じ） |
| GitHub Actions | ✅ `DeployGate/deploygate-upload-github-action` を使用 |
| 実現手段 | ワークフロー定義を**自動生成** |
| 成果物 | `.github/workflows/deploygate-upload.yml` |
| 動作確認 | CIでのビルド後にDeployGateダッシュボードで新リビジョンを確認 |

**GitHub Actionsの場合は公式Action `DeployGate/deploygate-upload-github-action` を使用する:**

```yaml
- uses: DeployGate/deploygate-upload-github-action@v1
  with:
    api_token: ${{ secrets.DEPLOYGATE_API_TOKEN }}
    owner_name: ${{ secrets.DEPLOYGATE_OWNER_NAME }}
    file_path: /path/to/app_file          # IPA / APK / AAB
    message: "Build from ${{ github.sha }}"
    distribution_name: "Release"           # 配布ページ名（任意）
    release_note: "${{ github.event.head_commit.message }}"
    enable_pr_comment: true                # PR時にコメントを自動投稿
```

**公式Actionの主な入力パラメータ:**
- `api_token`（必須）: DeployGate APIトークン
- `owner_name`（必須）: ユーザーまたは組織名
- `file_path`（必須）: アプリバイナリのパス（IPA/APK/AAB）
- `message`: ファイル説明
- `distribution_key`: 配布ページのハッシュ
- `distribution_name`: 配布ページ名
- `release_note`: 配布ページの更新メッセージ
- `disable_notify`: プッシュ通知を無効化（iOSのみ）
- `enable_pr_comment`: PRコメントを作成（デフォルト: true）

**出力:** `results` — DeployGate APIレスポンスのJSON（アプリ名、パッケージ名、バージョン情報、ダウンロードURL、アイコン等）

**Android の場合の代替: gradle-deploygate-plugin を使ったCIアップロード:**

CIでもgradle-deploygate-pluginを利用できる。GitHub Actionsワークフロー内で `./gradlew uploadDeployGate${VARIANT}` を実行する構成も可能。アクション側でファイルパスを管理する必要がなくなるメリットがある。

#### 既存のCI環境がある場合

特にiOSプロジェクトでは、macOSランナーが必要なため GitHub Actions 以外のCIサービス（Bitrise、CircleCI、Codemagic等）でビルドしているケースが多い。スキルは既存のCI環境を検出し、適切な構成をガイドする。

**Bitriseの場合:**
- DeployGate公式Step「[DeployGate Upload](https://github.com/DeployGate/upload-app-bitrise-step)」が利用可能。アップロードと配布ページの更新はこのStepで完結する
- 既存のビルドワークフローにDeployGate Upload Stepを追加するだけで Step 6 は完了

**CircleCI / Codemagic / その他のCIの場合:**
- `curl` でDeployGate APIを直接呼ぶか、Android の場合は gradle-deploygate-plugin を利用する
- `curl` の例:
  ```bash
  curl -F "file=@app.apk" -F "message=Build ${CIRCLE_SHA1}" \
    -F "distribution_name=Development" \
    "https://deploygate.com/api/users/${OWNER_NAME}/apps?token=${DEPLOYGATE_API_TOKEN}"
  ```

### Step 7. GitHub PR → 配布ページ自動作成・デプロイ状態反映（クローズ時に自動削除）

| 項目 | 内容 |
|---|---|
| 既存API | ✅ 配布ページ CRUD（作成・削除）、アップロードAPI |
| GitHub | GitHub Deployments API でPRにデプロイ状態を反映 |
| 実現手段 | **GitHub Actionsワークフロー**の自動生成 |
| 核心課題 | PR と配布ページの紐付け管理 |

#### PR ↔ Distribution の紐付け設計

**API挙動の前提（検証済み）:**
- アップロード時に `distribution_name` を指定 → 同名の配布ページ（`title`が一致）が存在しなければ新規作成（`active: false`）、存在すれば更新
- レスポンスの `results.distribution.access_key` が配布ページのキー
- 2回目以降は `distribution_key`（= `access_key`）を指定すれば確実に同じ配布ページに更新できる
- `distribution_key` と `distribution_name` を両方指定した場合、**`distribution_key` が優先され `distribution_name` は無視される**

**課題:** PRタイトルを `distribution_name` に含めたいが、PRタイトルは変更される可能性がある。`distribution_name` をキーとして使うと、タイトル変更時に別の配布ページが作られてしまう。

**採用方式: PR番号ベースで作成 + `distribution_key` を永続保持**

```
初回（PR Open / 最初のpush）:
  1. ビルド
  2. distribution_name = "PR #123: feature/new-login" でアップロード
  3. レスポンスから distribution_key を取得
  4. distribution_key を PR コメントに保存（機械読み取り可能な形式で埋め込む）
  5. PRにコメントで配布ページURLを通知

2回目以降（push / synchronize）:
  1. ビルド
  2. PRコメントから distribution_key を検索・取得
  3. distribution_key を指定してアップロード（確実に同じ配布ページに更新）
  4. PRタイトルが変更されていた場合:
     PUT /api/distributions/{ID} で distribution の名前も更新

PR Close/Merge:
  1. PRコメントから distribution_key を取得
  2. DELETE /api/distributions/{ID} で配布ページ削除
```

**`distribution_key` の保存方法とPRコメントの設計:**

PRコメントは2つの役割を兼ねる: (1) テスターへの配布ページ案内（URL + QRコード）、(2) ワークフロー用メタデータの保持。

```markdown
## 🚀 DeployGate

**PR #123: feature/new-login**

| 配布ページ | QRコード |
|---|---|
| [配布ページを開く](https://deploygate.com/distributions/xxx) | ![QR](https://deploygate.com/qr?size=178&data=https://deploygate.com/distributions/xxx) |

📱 スマートフォンでQRコードを読み取るとアプリをインストールできます
🖥️ PCからはリンクをクリックしてInstant Deviceでプレビューできます

<!-- deploygate:access_key=abc123def456 -->
```

テスターにとっての利便性:
- **スマホ**: PRコメントのQRコードをカメラで読み取り → 即インストール
- **PC**: リンクをクリック → Instant Deviceでブラウザ上プレビュー

ワークフロー側:
- `<!-- deploygate:access_key=... -->` をパースして値を取得
- HTMLコメントなのでレンダリングされず、PRコメントとして自然に見える
- 2回目以降のアップロード時はコメントを更新（最新ビルド情報を反映）

**deploygate-upload-github-action の改修が必要:**

現行のActionのPRコメントには `access_key` のメタデータ埋め込みがない。計画のStep 7を実現するには、Actionを改修して `<!-- deploygate:access_key=... -->` をコメントに埋め込む機能を追加する必要がある。この改修は Milestone 3 のスコープに含める。

**PRタイトル変更への対応:**

ワークフローの `synchronize` イベント時に、PRの現在のタイトルと配布ページ名を比較し、異なれば `PUT /api/distributions/{access_key}` で名前を更新する（`title` パラメータ。ただし `active` と `release_scope` も必須のため、事前にGETして現在値を取得してから送信する）。テスターには常にPRの最新タイトルが配布ページ名として表示される。

```yaml
on:
  pull_request:
    types: [opened, synchronize, closed]
```

#### 外部CI（Bitrise等）との組み合わせ

iOSプロジェクトなどで Bitrise がビルド＋DeployGateアップロードを担当している場合、PR連携の機能を分担する。

```
Bitrise（既存CI）:
  - ビルド
  - DeployGate へのアップロード（公式Step経由）
  - 配布ページの更新（distribution_name or distribution_key指定）

GitHub Actions（補助ワークフロー）:
  - PRコメントの作成・更新（QRコード + 配布ページURL + distribution_keyの保持）
  - PRタイトル変更時の配布ページ名更新
  - GitHub Deployment状態の反映
  - PRクローズ時の配布ページ削除
```

Bitriseのワークフロー完了をトリガーにGitHub Actionsを起動する方法:
- **Bitrise側**: ワークフロー完了時に GitHub API を呼んで `repository_dispatch` イベントを発火、またはDeployGateアップロード結果をPRコメントとして直接投稿
- **GitHub Actions側**: `repository_dispatch` or `workflow_run` をトリガーにPRコメント・Deployment状態を管理

> **スキルのガイド方針:** 既存のCIワークフロー（`bitrise.yml` 等）を検出した場合、スキルは「既存のCIにDeployGate Stepを追加する」方式を優先的に案内し、GitHub Actionsは補助的な役割（PRコメント・クリーンアップ）のみを担当する構成を提案する。

**ワークフロー概要:**

```yaml
jobs:
  deploy:
    if: github.event.action != 'closed'
    steps:
      - name: Build app
        # ビルドステップ（プロジェクトに依存）

      - name: Find existing distribution key
        id: find-key
        # PRコメントから <!-- deploygate:access_key=... --> を検索
        # 見つかれば outputs.distribution_key に設定

      - name: Upload to DeployGate
        uses: DeployGate/deploygate-upload-github-action@v1
        with:
          api_token: ${{ secrets.DEPLOYGATE_API_TOKEN }}
          owner_name: ${{ secrets.DEPLOYGATE_OWNER_NAME }}
          file_path: ./app/build/outputs/apk/debug/app-debug.apk
          distribution_key: ${{ steps.find-key.outputs.distribution_key }}  # 2回目以降
          distribution_name: "PR #${{ github.event.pull_request.number }}: ${{ github.event.pull_request.title }}"  # 初回
          release_note: "${{ github.event.pull_request.title }}"

      - name: Save distribution key & post comment
        # 初回: レスポンスから distribution_key を取得してPRコメントに保存
        # 2回目以降: 既存コメントを更新（最新ビルド情報を反映）

      - name: Update distribution name if PR title changed
        # PRタイトルが変更されていた場合、PUT APIで配布ページ名を更新

      - name: Create GitHub Deployment
        # GitHub Deployments API でデプロイ状態を作成
        # PRに「deployed」バッジが表示され、配布ページURLがEnvironment URLとして紐付く
        # github.rest.repos.createDeployment() + createDeploymentStatus()

  cleanup:
    if: github.event.action == 'closed'
    steps:
      - name: Find distribution key
        # PRコメントから distribution_key を取得

      - name: Delete distribution page
        # DELETE /api/distributions/{ID}
```

---

### Step 8. SDKの追加

| 項目 | 内容 |
|---|---|
| 既存API | — （コードベースへの変更であり、API呼び出しではない） |
| 実現手段 | プロジェクト構成を解析し、適切なSDK追加コードを生成・挿入 |

**SDKを追加するメリット:**
- **クラッシュ通知とログ収集**: アプリがクラッシュした際に自動で通知が届き、クラッシュ時のアプリログも取得できる。再現困難なバグの調査に役立つ
- **キャプチャ機能**: テスターがアプリ内でスクリーンショットを撮るだけで、端末情報やアプリの状態を含んだ不具合報告が自動生成される。正確で手軽な報告がアプリの改善サイクルを加速する

> **前提:** DeployGate SDKはDeployGate経由で配布されたアプリでのみ動作する。通常の開発ビルド（Android Studioから直接実行等）では動作しない。動作確認はDeployGateにアップロードしたビルドをインストールして行う必要がある。

**Android:**
- `build.gradle` に依存関係を追加。初期化コードは基本的に不要（マルチプロセスアプリの場合のみ必要）
- **推奨構成: debug/releaseの分離**
  ```kotlin
  dependencies {
      debugImplementation("com.deploygate:sdk:4.9.0")        // debug: 実際のSDK
      releaseImplementation("com.deploygate:sdk-mock:4.9.0") // release: モック（動作するコードを含まない）
  }
  ```
  これにより、リリースビルドにはSDKの実コードが含まれず、アプリサイズやパフォーマンスへの影響がない
- （任意）[gradle-deploygate-plugin](https://github.com/DeployGate/gradle-deploygate-plugin) を導入し、ローカルからのビルド＋アップロードを `./gradlew uploadDeployGate${VARIANT}` で実行可能にする

**iOS:**
- `Podfile` / SPM に依存関係を追加
- `AppDelegate` に初期化コードを追加

**動作確認:**
SDKを組み込んだビルドをDeployGateにアップロードし、配布ページからインストールしてアプリを起動する。起動時に launch イベントが送信され、DeployGateダッシュボードでデバイスの接続を確認できる。

Claude Codeの場合はコードベースを直接編集できるため、自動化が可能。スキルがプロジェクト構成（Gradle / CocoaPods / SPM）を自動検出し、適切な追加方法をガイドする。

### Step 9. 動作確認

各ステップの完了後に検証を行う。

| ステップ | 確認方法 |
|---|---|
| アプリアップロード | APIでリビジョン一覧を取得し、最新リビジョンの存在を確認 |
| 配布ページ | 配布URLにアクセスし、Instant Deviceでプレビュー表示を確認 |
| Slack通知 | テストアップロードを行い、Slackチャンネルに通知が届くことを確認 |
| CI連携 | テストプッシュでワークフローが起動し、アップロードが成功することを確認 |
| GitHub PR連携 | テストPRを作成し、配布ページが生成されることを確認 |
| SDK | ビルド成功とDeployGateダッシュボードでの初期化ログを確認 |

---

### Step 10. 配布ページの公開範囲設定（Flexibleプラン以上）

配布ページの公開範囲を用途に合わせて変更する。

| 項目 | 内容 |
|---|---|
| 既存API | ✅ `PUT /api/distributions/{DISTRIBUTION_ID}` |
| 実現手段 | 配布ページの設定を更新 |

**公開範囲の4段階（`release_scope` パラメータ）:**
- **`public`** — 公開。検索エンジンにもインデックス可能
- **`unlisted`** — 限定公開（デフォルト）。URLを知っていれば誰でもアクセス可能
- **`passcode`** — URLに加えて合言葉の入力が必要（`passcode` パラメータも必須）
- **`authorized_only`** — DeployGateアカウントでのログインが必要。Step 11 でメンバーを追加する必要がある

**PUT 更新時の注意:** 配布ページ名（`title`）のみを変更したい場合でも、`active` と `release_scope` は必須パラメータのため、事前にGETで現在値を取得してから送信する必要がある。

### Step 11. メンバーの追加（Flexibleプラン以上）

> **プランの制約:** Freeプランではメンバー上限が2名（自分+1名）。3人目以降を追加しようとするとエラーが返る。Flexibleプランに契約することで上限が解除される。MCPツールはエラーをキャッチし、プランのアップグレードを案内する。

メンバーとして追加されたユーザーは、配布ページ経由のアクセスとは異なり、**過去のすべてのリビジョン**（プランによって数の制限あり）をクライアント端末から選択してインストールできる。開発者やQAメンバーには、特定バージョンのデバッグが必要な場面で有用。

メンバー追加は**ロールに応じて3〜4ステップ**の操作が必要。MCPツールではこれを1つの高レベルコマンドとして抽象化し、内部で複数のAPIを順次呼び出す。

| 項目 | 内容 |
|---|---|
| 既存API | ✅ すべて利用可能（下記参照） |
| 実現手段 | ロール（owner/developer/tester）に応じたオーケストレーション |

**開発者（owner / developer）を追加する場合:**
```
1. POST /api/enterprises/{WORKSPACE}/users                          ← Workspaceに追加
2. POST /api/enterprises/{WORKSPACE}/organizations/{PROJECT}/users  ← Projectに追加
3. POST /api/organizations/{PROJECT}/teams/{TEAM}/users             ← owner or developerチームに追加
```

**テスターを追加する場合:**
```
1. POST /api/enterprises/{WORKSPACE}/users                          ← Workspaceに追加
2. POST /api/enterprises/{WORKSPACE}/organizations/{PROJECT}/users  ← Projectに追加
3. POST /api/organizations/{PROJECT}/teams/tester/users             ← testerチームに追加
4. POST /api/organizations/{PROJECT}/platforms/{PLATFORM}/apps/{APP_ID}/teams
   body: { team: "tester" }                                         ← testerチームをアプリにアサイン
```

> **重要**: testerチームはデフォルトではアプリにアサインされていないため、Step 4 を忘れるとテスターがアプリにアクセスできない。MCPツールではこれを自動的に処理する。

**動作確認:**
- `GET /api/organizations/{PROJECT}/teams/{TEAM}/users` でチームメンバー一覧を確認
- `GET /api/organizations/{PROJECT}/platforms/{PLATFORM}/apps/{APP_ID}/teams` でアプリのチームアサインを確認

### Step 12. 共有チームによる大規模配布（Flexibleプラン以上）

ドッグフーディングなど、多数のユーザーにアプリを配布したい場合は、Workspace単位の**共有チーム（Shared Teams）**を活用する。

| 項目 | 内容 |
|---|---|
| 既存API | ✅ 共有チーム CRUD + アプリへのアサイン |
| ユースケース | 全社員チーム、QAチーム等をアプリにアサインし、一括でtester権限を付与 |

**フロー:**
```
1. POST /api/enterprises/{WORKSPACE}/sharedteams                     ← 共有チーム作成（例: "all staff"）
2. POST /api/enterprises/{WORKSPACE}/users                           ← メンバーをWorkspaceに追加（未追加の場合）
3. POST /api/enterprises/{WORKSPACE}/shared_teams/{SHARED_TEAM_ID}/users
   body: { email: "user@example.com" }                               ← 共有チームにメンバー追加
4. POST /api/organizations/{PROJECT}/platforms/{PLATFORM}/apps/{APP_ID}/sharedteams
   body: { team: "all staff" }                                       ← 共有チームをアプリにアサイン（tester権限）
```

**共有チームメンバー管理API:**
```
GET    /api/enterprises/{WORKSPACE}/shared_teams/{SHARED_TEAM_ID}/users       ← メンバー一覧
POST   /api/enterprises/{WORKSPACE}/shared_teams/{SHARED_TEAM_ID}/users       ← メンバー追加
DELETE /api/enterprises/{WORKSPACE}/shared_teams/{SHARED_TEAM_ID}/users/{ID}  ← メンバー削除
```
- 追加時パラメータ: `email` **XOR** `username`（どちらか一方のみ必須、両方指定はバリデーションエラー）、`description`（任意、max 255文字）
- `email` or `username` でWorkspace内のユーザーを検索して追加
- ゲストメンバーは追加不可
- Workspace未所属のユーザーの場合: 呼び出し元に権限があればWorkspace Member APIでの追加を案内、権限がなければ招待リクエストを作成（`email` と `description` が必須）
- 削除時の `{ID}` は username or email

> **メリット**: 共有チームは複数のProject・アプリ横断で再利用可能。一度 "all staff" チームを作れば、新しいアプリにアサインするだけで全社員がアクセスできる。

### Step 5 補足: UDID管理の詳細仕様（iOS Ad Hoc 固有）

| 項目 | 内容 |
|---|---|
| 既存API | ✅ `GET /api/users/{USER_ID}/platforms/ios/apps/{APP_ID}/udids` （非公開だが既存） |
| 実現手段 | MCPツールでUDIDリストを取得し、fastlane等でApple Developer登録を自動化 |

このAPIは既存だがドキュメント化されていない。MCPサーバーに組み込む際にドキュメントも整備する。

#### UDID リスト API のレスポンス形式

```json
{
  "error": false,
  "results": [
    {
      "udid": "00008030-001234567890001E",
      "user_name": "tester1",
      "device_name": "iPhone 15 Pro",
      "is_provisioned": false
    },
    {
      "udid": "00008101-001234567890002E",
      "user_name": "tester2",
      "device_name": "iPad Air (5th generation)",
      "is_provisioned": true
    }
  ]
}
```

| フィールド | 内容 |
|---|---|
| `udid` | デバイスのUDID |
| `user_name` | デバイス所有者のユーザー名（未登録の場合はdistributionのデバイス表示名） |
| `device_name` | デバイス名（正規化済み） |
| `is_provisioned` | 最新バイナリのProvisioning ProfileにそのUDIDが含まれているか |

**`is_provisioned: false` のデバイスが、追加が必要なデバイス。** MCPツールはこのフラグでフィルタリングし、未登録デバイスのみを表示する。

#### iOS Ad Hoc 配布における UDID 管理の全体フロー

Ad Hocビルドでは、インストール先端末のUDIDがアプリのProvisioning Profileに含まれている必要がある。新しいテスター端末が加わるたびに以下のサイクルが発生する。

```
テスター側:
  1. 配布ページのリンクを開く
  2. iOS端末にDeployGateの構成プロファイルをインストール
  3a. 端末のUDIDがProvisioning Profileに含まれている → そのままインストール可能
  3b. 含まれていない → エラー表示:
      "This device's UDID is not included in the app's provisioning profile.
       To reactivate the app, please add the UDID to the provisioning profile of the app."
      "Please contact the developer to refresh the profile."
      （日本語ロケールの場合は日本語で表示）

開発者側（自動通知）:
  4. DeployGateから「新しいUDIDがあります」というメールが開発者に届く

開発者側（エージェントクライアントで自動化可能な部分）:
  5. DeployGate API で新しいUDIDを取得
  6. Apple Developer Portal にUDIDを登録
  7. Provisioning Profileを更新
  8. 更新されたProvisioning Profileで再アーカイブ・エクスポート
  9. 新しいIPAをDeployGateにアップロード、配布ページを更新

テスター側:
  10. 先ほどインストールできなかった端末でもアプリがインストール可能になる
```

#### Claude Code / MCPツールによる自動化

上記フローの 5〜9 をエージェントクライアントで自動化する。開発者が「新しいUDIDのメール来た」と伝えるだけで、以下を実行する。

```bash
# Step 5: DeployGateから新しいUDIDを取得（is_provisioned: false のもの）
# (MCPツール: get_udids → is_provisioned == false でフィルタ)

# Step 6: Apple Developer PortalにUDIDを登録
# デバイス名は "$device_name ($user_name)" 形式で登録すると棚卸しがしやすい
fastlane run register_devices devices: {
  "iPhone 15 Pro (tester1)" => "00008030-001234567890001E",
  "iPad Air 5th generation (tester2)" => "00008101-001234567890002E"
}

# Step 7: Provisioning Profileを更新
fastlane sigh --adhoc --force

# Step 8: 再アーカイブ・エクスポート
fastlane gym --scheme "MyApp" --export_method "ad-hoc"

# Step 9: DeployGateにアップロード・配布ページ更新
# (MCPツール: upload_app with distribution_key)
```

> **スキルのガイド方針:** テスターがインストールできなかったとき、開発者は「UDIDを追加して」とClaude Codeに伝えるだけで対応完了するのが理想。スキルはfastlaneのセットアップ状況を検出し、未導入であればセットアップもガイドする。
>
> **iOSプロジェクトの場合のオンボーディングフロー:**
> Phase 1（Step 1〜4）完了後、スキルは「テスターが実機でインストールするにはUDIDの登録が必要です。テスターに配布リンクを開いてもらった後、UDIDの追加を行いましょう」と案内し、Step 5 の実施を促す。Phase 2（CI/CD）はPhase 1の完了条件を満たした後に進める。

### 補足: アプリレベルの通知連携

配布ページ単位（Step 4）ではなく、アプリ全体の変化（新リビジョンのアップロード、メンバー追加等）を通知したい場合は、アプリレベルの通知設定を行う。

**アプリレベルの設定URL:**

Organization所有アプリの場合:
```
https://deploygate.com/organizations/{OWNER_NAME}/platforms/{PLATFORM}/apps/{PACKAGE_NAME}/notification_settings/new
```

User所有アプリの場合（パスが異なることに注意）:
```
https://deploygate.com/users/{USER_NAME}/platforms/{PLATFORM}/apps/{PACKAGE_NAME}/notification_settings/signup
```

最短パスではStep 4の配布ページレベルの通知設定を優先するが、チーム規模が大きくなりアプリ全体の活動を把握したい場合はこちらも設定を推奨する。


---

## 4. 実現手段の比較と方針

### 4.1 MCP サーバー vs スキル vs ガイドドキュメント

| 手段 | 特徴 | 適するケース |
|---|---|---|
| **MCPサーバー** | Claude/Claude CodeからAPIを直接呼べるツール群。認証の永続化、リアルタイム操作が可能 | アップロード、メンバー管理、配布ページ操作など、繰り返し使うCRUD操作 |
| **スキル（SKILL.md）** | ベストプラクティスをまとめた手順書。Claude Codeが読み取って実行 | オンボーディング全体のフロー制御、CI設定ファイル生成、SDK追加 |
| **ガイドドキュメント** | ユーザーが読んで手動実行 | アカウント作成のような手動ステップ |

### 4.2 推奨アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│           DeployGate Onboarding Skill           │
│  (オンボーディング全体のフロー制御・ガイド)        │
└────────────────────┬────────────────────────────┘
                     │ 呼び出し
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌──────────┐  ┌────────────────────┐  ┌──────────────┐
│ DeployGate│  │ GitHub Actions     │  │ コードベース  │
│ MCP Server│  │ ワークフロー生成   │  │ 編集(SDK追加) │
│           │  │                    │  │              │
│ - upload  │  │ - deploygate-      │  │ - Android    │
│ - members │  │   upload-github-   │  │ - iOS        │
│ - distrib │  │   action           │  │              │
│ - devices │  │ - PR deploy        │  │              │
│ - notify  │  │ - PR status        │  │              │
│   URL生成 │  │                    │  │              │
└──────────┘  └────────────────────┘  └──────────────┘
     │
     ▼
┌──────────────────┐
│ DeployGate API   │
│ (既存 + 新規)    │
└──────────────────┘
```

**結論: DeployGate Agent Pluginとして配布する。** MCPサーバー + スキルをプラグインにパッケージ化し、`DeployGate/deploygate-agent-plugin` リポジトリで公開する。

理由:
- MCPサーバーにより、Claude/Claude CodeのどちらからでもシームレスにDeployGate APIを操作できる
- スキルにより、オンボーディングの各ステップを正しい順序で、ベストプラクティスに沿ってガイドできる
- CI設定やSDK追加はスキルの中でClaude Codeのファイル操作能力を活用できる
- プラグイン形式にすることで、ユーザーは `/plugin` コマンド一つで導入できる

---

## 5. マイルストーン計画

### Milestone 0: 設計・準備 ✅
- [x] 新規API仕様の確定（UDID取得、Slack通知設定）
- [x] MCPサーバーの技術スタック選定 → TypeScript + Node.js + @modelcontextprotocol/sdk
- [x] GitHub Actionsワークフローテンプレートの設計

### Milestone 1: MCPサーバー — コア機能 ✅
APIをClaude/Claude Codeから呼べるMCPツールとして実装。16ツール実装済み。

- [x] **認証**: `set_api_token`（動的トークン設定+検証）、`get_user_info`
- [x] **アプリ管理**: `upload_app`（`ios_simulator_zip` Instant Device対応含む）
- [x] **メンバー管理（オーケストレーション）**:
  - [x] 開発者追加: `add_member` — Workspace → Project → Team の3ステップを1コマンドに
  - [x] テスター追加: 上記3ステップ + アプリへのtesterチームアサインの4ステップを1コマンドに
  - [x] `list_members`、`remove_member`
- [x] **配布ページ管理**: `create_distribution`、`update_distribution`、`delete_distribution`、`list_distributions`、`get_distribution`
- [x] **iOS UDIDリスト取得**: `get_udids`（`unprovisioned_only` フィルタ付き）
- [x] **通知設定URLヘルパー**: `get_notification_settings_url`（配布/アプリレベル、org/user対応）
- [x] **共有チーム管理**: `create_shared_team`、`add_shared_team_member`、`assign_shared_team_to_app`
- [x] 各ツールのバリデーション・エラーハンドリング
- [x] 動作確認テスト（92件）

### Milestone 2: APIドキュメント整備・補助機能 ✅

- [x] **iOS UDIDリスト取得API のドキュメント整備** → README.mdに記載
- [x] **通知設定URLヘルパー**: `get_notification_settings_url` MCPツールとして実装済み
- [x] README.md — 全16ツールの一覧・パラメータ・使い方を記載
- [x] MCPツールの description 改善（優先順位、エラーハンドリング詳細等）

### Milestone 3: GitHub連携ワークフロー ✅
GitHub Actions用のワークフローテンプレートを作成。

- [x] **deploygate-upload-github-action の改修提案**: `docs/github-action-enhancement.md` に仕様記載
- [x] **CIアップロードワークフロー**: `templates/deploygate-upload.yml`
- [x] **PR配布ページワークフロー**: `templates/deploygate-pr.yml` — QRコード付きPRコメント、タイトル同期、GitHub Deployment、クローズ時削除
- [x] **外部CI対応**: `docs/external-ci-integration.md` — Bitrise、CircleCI、Codemagic対応
- [x] ワークフローテンプレートのバリデーションテスト

### Milestone 4: オンボーディングスキル ✅
エージェントクライアント向けのスキルファイルを作成。

- [x] `skills/onboarding/SKILL.md` — Phase 1〜5の全フロー
- [x] `skills/ci-setup/SKILL.md` — CI/CD連携セットアップ
- [x] `skills/sdk-setup/SKILL.md` — Android/iOS SDK追加ガイド
- [x] MCPツール呼び出しの組み込み（`set_api_token`、`upload_app`、`create_distribution` 等）
- [x] 分岐ロジック（iOS/Android、Ad Hoc/In-House、Instant Device/実機）
- [x] Step 4→5の順序制御、Phase 1完了条件の厳密化
- [x] UDID追加のClaude Code自動化フロー
- [x] トラブルシューティングガイド

### Milestone 5: SDK追加ガイド ✅
`skills/sdk-setup/SKILL.md` に実装。

- [x] **Android**: debug/release分離構成（sdk + sdk-mock）、gradle-deploygate-plugin
- [x] **iOS**: CocoaPods / SPM 対応、AppDelegate初期化コード
- [x] プロジェクト構成の自動検出ロジック（Gradle/CocoaPods/SPM）
- [x] ビルド確認手順

### Milestone 6: プラグインパッケージング・公開 ✅
DeployGate Agent Pluginとしてパッケージ化。

- [x] プラグインリポジトリ `DeployGate/deploygate-agent-plugin` の作成
- [x] `.claude-plugin/plugin.json` — プラグインメタデータ
- [x] `.claude-plugin/marketplace.json` — マーケットプレイス定義（source: "./"）
- [x] `.mcp.json` — `${CLAUDE_PLUGIN_ROOT}` でポータブルなパス解決
- [x] `commands/deploy.md`、`commands/setup.md` — スラッシュコマンド（プラグインネームスペースで `/deploygate:deploy`、`/deploygate:setup`）
- [x] `README.md`、`LICENSE`（MIT）
- [x] `package.json` v1.0.0 — `prepare` スクリプトでビルド自動化

### Milestone 7: E2Eテスト・品質保証 ✅
全92テスト通過。

- [x] ワークフローYAMLバリデーション（13テスト）
- [x] スキル整合性テスト — MCPツール名のクロスリファレンス、テンプレート実在確認（14テスト）
- [x] プラグインマニフェストスキーマ検証（19テスト）
- [x] APIクライアントテスト — 認証、エラーハンドリング、トークン管理（25テスト）
- [x] MCPツールテスト — オーケストレーション、URL生成、バリデーション（21テスト）
- [x] GitHub Actions CI（`.github/workflows/ci.yml`）— PR checks

---

## 6. 新規API開発の仕様案

### 6.1 iOS UDID一覧取得（既存APIのドキュメント化）

既存の非公開エンドポイントを正式にドキュメント化し、MCPサーバーに組み込む。

```
GET /api/users/{USER_ID}/platforms/ios/apps/{APP_ID}/udids
```

**レスポンス形式（検証済み）:**
```json
{
  "error": false,
  "results": [
    {
      "udid": "00008030-001234567890001E",
      "user_name": "tester1",
      "device_name": "iPhone 15 Pro",
      "is_provisioned": false
    }
  ]
}
```

`is_provisioned` フラグにより、Provisioning Profile未登録のデバイスをフィルタリングできる。

### 6.2 通知連携設定（Slack / Teams / Chatwork）

通知連携はOAuth認可フロー等のブラウザ操作が必要なため、API化は行わない。代わりにMCPツール/スキルが設定URLを自動生成し、ユーザーにブラウザでの操作をガイドする方針とする。

**2つのレベルの設定URL（自動生成）:**

配布ページレベル（最短パスで使用）:
```
https://deploygate.com/distributions/{DISTRIBUTION_ACCESS_KEY}/notification_settings/new
```

アプリレベル（アプリ全体の通知）:

Organization所有アプリの場合:
```
https://deploygate.com/organizations/{OWNER_NAME}/platforms/{PLATFORM}/apps/{PACKAGE_NAME}/notification_settings/new
```

User所有アプリの場合（パスが異なる）:
```
https://deploygate.com/users/{USER_NAME}/platforms/{PLATFORM}/apps/{PACKAGE_NAME}/notification_settings/signup
```

MCPツールに `get_notification_settings_url` のようなヘルパーを用意し、オーナーの種別（Organization / User）に応じてURLを組み立てて返す。

### 6.3 配布ページ管理の追加パラメータ（検討）

現在の配布ページAPIに対して、GitHub PR連携を見据えた拡張も検討に値する。

```json
{
  "title": "PR #123: feature/new-login",
  "metadata": {
    "source": "github_pr",
    "pr_number": 123,
    "repository": "org/repo",
    "branch": "feature/new-login"
  }
}
```

配布ページの `metadata` フィールドがあると、PR番号での検索・フィルタリングが可能になり、クローズ時の自動削除も確実に行える。

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 新規API開発のスケジュール遅延 | M2以降がブロック | M1（既存API部分）を先行し、新規APIなしでも一部機能が使える状態にする |
| iOS UDID管理の複雑性 | Apple Developer Portalとの連携が必要 | まずはUDIDリスト取得のみに集中し、Portal連携はfastlane等の既存ツールに委ねる |
| GitHub Actionsの多様な構成 | Android/iOS、モノレポ等でワークフローが異なる | テンプレートを複数用意し、プロジェクト構成に応じて選択するロジックをスキルに組み込む |
| MCPサーバーの認証管理 | APIキーの安全な保存 | MCPの設定ファイル（`claude_desktop_config.json`等）での環境変数参照を標準とする |

---

## 8. 優先順位サマリー

すぐに始められること（既存APIで実現可能）と、開発が必要なことを分けて進めるのが効率的。

**すぐ着手可能（既存APIで実現可能）:**
1. MCPサーバーのコア機能（アップロード、メンバー管理オーケストレーション、配布ページ管理）
2. iOS UDIDリスト取得（既存の非公開エンドポイントを活用）
3. GitHub Actionsワークフローテンプレート作成
4. SDK追加ガイド・コード生成
5. オンボーディングスキルの骨格

**ブラウザガイドで対応（API開発不要）:**
6. チャット通知連携（Slack/Teams/Chatwork） — 設定URLの自動生成+ガイド

**あると望ましい（Nice to have）:**
7. 配布ページの `metadata` フィールド（PR連携の堅牢化）
8. アカウント作成API
9. GitHub App / Webhook による双方向連携
10. iOS UDIDリスト取得APIの正式ドキュメント化

---

## 9. プラグイン配布計画

### 9.1 リポジトリ構成

`DeployGate/deploygate-agent-plugin` リポジトリの実際の構造:

```
DeployGate/deploygate-agent-plugin/
├── .claude-plugin/
│   ├── plugin.json              # プラグインメタデータ
│   └── marketplace.json         # マーケットプレイス定義
├── .mcp.json                    # MCPサーバー定義（${CLAUDE_PLUGIN_ROOT}でパス解決）
├── .github/workflows/
│   └── ci.yml                   # PR checks（build + test）
├── commands/
│   ├── deploy.md                # /deploy → /deploygate:deploy
│   └── setup.md                 # /setup → /deploygate:setup
├── skills/
│   ├── onboarding/SKILL.md      # オンボーディング全体フロー
│   ├── ci-setup/SKILL.md        # CI/CDセットアップ
│   └── sdk-setup/SKILL.md       # SDK追加ガイド
├── src/                         # MCPサーバー実装（TypeScript）
│   ├── index.ts                 # エントリーポイント
│   ├── client.ts                # DeployGate APIクライアント（動的トークン対応）
│   ├── tools/
│   │   ├── auth.ts              # set_api_token, get_user_info
│   │   ├── upload.ts            # upload_app（ios_simulator_zip対応）
│   │   ├── distributions.ts     # create/list/get/update/delete_distribution
│   │   ├── udids.ts             # get_udids
│   │   ├── notifications.ts     # get_notification_settings_url
│   │   ├── members.ts           # add/list/remove_member
│   │   └── shared-teams.ts      # create/add_member/assign_shared_team
│   └── __tests__/               # テスト（92件）
├── templates/
│   ├── deploygate-upload.yml    # mainブランチ用ワークフロー
│   └── deploygate-pr.yml        # PR連携用ワークフロー
├── docs/                        # 仕様書・ガイド
├── README.md
├── LICENSE                      # MIT (DeployGate Inc.)
├── package.json                 # v1.0.0
├── tsconfig.json
└── vitest.config.ts
```

### 9.2 plugin.json

```json
{
  "name": "deploygate",
  "version": "1.0.0",
  "description": "DeployGate integration for Claude Code — upload mobile apps, manage distribution pages, set up CI/CD, and onboard your team. Supports iOS (IPA) and Android (APK/AAB).",
  "author": {
    "name": "DeployGate",
    "email": "support@deploygate.com"
  },
  "homepage": "https://deploygate.com",
  "license": "MIT",
  "keywords": [
    "deploygate",
    "mobile",
    "distribution",
    "ios",
    "android",
    "testing",
    "ci-cd"
  ],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

### 9.3 marketplace.json

```json
{
  "name": "deploygate-marketplace",
  "owner": {
    "name": "DeployGate",
    "email": "support@deploygate.com"
  },
  "plugins": [
    {
      "name": "deploygate",
      "source": "./",
      "description": "Upload apps, manage distribution pages, add team members, and set up CI/CD integration with DeployGate",
      "version": "1.0.0"
    }
  ]
}
```

> **注意:** `source` は `"."` ではなく `"./"` を指定する。マーケットプレイスでは相対パスは `"./"` で始まる必要がある。

### 9.4 ユーザーの導入フロー

**方法1: マーケットプレイス経由（推奨）**
```bash
# マーケットプレイスを追加
/plugin marketplace add DeployGate/deploygate-agent-plugin

# Discoverタブからインストール
/plugin
```

**方法2: 直接インストール**
```bash
/plugin install deploygate@deploygate-marketplace
```

**初回セットアップ:**
1. インストール後、MCPサーバーはトークン未設定でも起動する
2. `/setup`（= `/deploygate:setup`）コマンドまたは「DeployGateのセットアップをしたい」と伝えると、オンボーディングスキルが起動
3. スキルのガイドに沿ってアカウント作成 → `set_api_token` でトークン設定 → Phase 1 から順に進める
4. 次回以降は環境変数 `DEPLOYGATE_API_TOKEN` を設定しておくと自動認証される

**Anthropic公式マーケットプレイスへの掲載:**
利用が広がった段階で、公式マーケットプレイスへの掲載を申請する。掲載されると、対応エージェントクライアントのユーザーがプラグインを直接発見・インストールできるようになる。

---

*作成日: 2026-03-19*
*最終更新: 2026-03-23 — 全マイルストーン完了、実装結果を反映*
