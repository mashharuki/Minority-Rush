# Minority Rush — Game Concept

## 1. 概要

**Minority Rush**
は、プレイヤーが2つの陣営から1つを秘密裏に選び、暗号化されたチップを賭けて「総賭け金が少ない側」を狙う、短時間のオンチェーン・マルチプレイゲームです。

プレイヤーの選択、賭け金、残高はZama
Protocolによって暗号化されたままオンチェーンで処理されます。他のプレイヤーはもちろん、ブロックエクスプローラーを見てもラウンド中の形勢を把握できません。

透明なブロックチェーンでは、後から参加するプレイヤーが陣営別の賭け金を確認し、有利な側を選べてしまいます。Minority
Rushは、ゲームの中心となる読み合いを成立させるためにオンチェーンの機密性を必要とします。

> One choice. One secret stake. Outsmart the crowd.

## 2. 着想

この企画は、以下のゲームが持つ魅力を受け継ぎます。

### trivia.techから継承するもの

- 同時参加型の短時間マルチプレイ
- 初見でも理解できるシンプルなルール
- ラウンドを繰り返したくなる収集要素
- モバイルで遊びやすい導線

参考: [trivia.tech紹介記事](https://dena.com/jp/news/5077/)

### PushFiから継承するもの

- 基本操作がボタンを押すだけの低い参加障壁
- 短いゲーム時間
- 結果が出るまでの待ち時間を演出に変えるUX
- ウォレットやトランザクションを強く意識させない設計

参考: [PushFi GitHubリポジトリ](https://github.com/mashharuki/PushFi)

## 3. コアとなるゲーム体験

1ラウンドは、次の流れで進行します。

1. 2〜8人のプレイヤーがルームに参加する。
2. 「SUN」と「MOON」など、2つの陣営が表示される。
3. 各プレイヤーは陣営と賭けるチップ数を選ぶ。
4. 陣営と賭け金を暗号化し、1回の操作で送信する。
5. ラウンド終了まで、参加人数以外の情報は公開されない。
6. 締切後、コントラクトが暗号化された合計賭け金を比較する。
7. 総賭け金が少なかった陣営が勝利する。
8. 勝者は原則として賭け金の2倍を受け取る。
9. 各プレイヤーは、自分の勝敗と残高だけを復号して確認する。
10. 公開可能なラウンド結果と検証情報を表示する。

### 読み合い

ゲームの中心は、次のような心理戦です。

> みんなSUNを選びそうだ。  
> しかし、全員がそう考えてMOONへ移るかもしれない。  
> それならSUNに残るべきか？

選択状況と賭け金の両方が隠れているため、最後まで正解が分かりません。

## 4. 勝敗と報酬

### 基本ルール

- 各プレイヤーは1ラウンドにつき1回だけ参加できる。
- 選択肢は2つとする。
- 賭け金には最小値と最大値を設ける。
- 各陣営の**参加人数ではなく、総賭け金が少ない側**を勝者とする。
- 勝者は賭け金の2倍を受け取る。
- 残ったチップは次回ラウンドのジャックポットまたは運営用リザーブへ送る。

総賭け金が少ない側を勝者にすれば、勝者全員に賭け金の2倍を支払っても、原則としてラウンドのポット内に収まります。また、暗号化された参加人数を除算に利用する必要がないため、FHEVM上でも比較的シンプルに実装できます。

### 同額の場合

両陣営の総賭け金が同じ場合は、Zama Protocolの暗号化オンチェーン乱数を使って勝利陣営を決定します。

- `FHE.randEbool()` で暗号化されたランダムな真偽値を生成する。
- ランダム値は結果確定まで公開しない。
- 結果確定後、必要な情報だけを公開復号する。
- 復号結果と証明を使って、改ざんされていないことを確認できるようにする。

参考:
[Zama Protocol — Generate random numbers](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)

## 5. Confidentiality Design

### 暗号化する情報

| 情報               | 型の候補             | 公開範囲                 |
| ------------------ | -------------------- | ------------------------ |
| プレイヤーの陣営   | `euint8`             | 原則として本人のみ       |
| プレイヤーの賭け金 | `euint64`            | 本人とゲームコントラクト |
| SUN側の総賭け金    | `euint64`            | ゲームコントラクト       |
| MOON側の総賭け金   | `euint64`            | ゲームコントラクト       |
| プレイヤーの勝敗   | `ebool`              | 該当プレイヤーのみ       |
| プレイヤーの報酬   | `euint64`            | 該当プレイヤーのみ       |
| チップ残高         | ERC-7984 `euint64`   | トークン保有者のみ       |
| 最終的な勝利陣営   | 暗号化値から公開復号 | ラウンド終了後に公開     |

### Access Control

- 永続的に再利用する暗号文には `FHE.allowThis` を付与する。
- プレイヤーが復号できる値には `FHE.allow(value, player)` を付与する。
- 他のプレイヤーにはACL権限を付与しない。
- 公開すべき最終結果だけに `FHE.makePubliclyDecryptable` を使用する。
- 外部入力を受け取る際は、入力証明と送信者の権限を検証する。

参考: [Zama Protocol — Access Control List](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl)

### 公開情報

ラウンド中に公開する情報は、次の範囲に抑えます。

- ラウンドID
- 開始時刻と終了時刻
- 参加者数
- 参加済みアドレス
- ラウンドのステータス

ラウンド終了後は、次の情報を追加で公開できます。

- 勝利陣営
- 結果確定トランザクション
- 公開復号の証明
- オンチェーン乱数を使用したかどうか

個人の選択、賭け金、残高は公開しません。

## 6. ERC-7984 Integration

ゲーム内チップにはERC-7984準拠の機密トークンを利用します。

### 想定する機能

- テストプレイ用チップのFaucet
- 暗号化された残高
- 暗号化された送金額
- ゲームコントラクトへの機密な賭け金送金
- 勝者への機密な報酬送金
- 自分の残高だけを復号できる残高画面

`confidentialTransferAndCall`を利用すると、トークン送金とゲーム参加処理を接続できます。コールバックデータには、暗号化された陣営選択と入力証明を含める構成を検討します。

参考: [OpenZeppelin Confidential Contracts — ERC-7984](https://docs.openzeppelin.com/confidential-contracts/token)

## 7. スマートコントラクト案

### コントラクト構成

```text
MinorityRushGame
├── ラウンド作成・開始・終了
├── 暗号化された選択の受付
├── 暗号化された陣営別プールの更新
├── 勝利陣営の暗号化判定
├── 同額時の暗号化乱数処理
├── プレイヤーごとの報酬計算
└── 公開復号フロー

RushChip (ERC-7984)
├── 暗号化残高
├── Faucetまたは初期配布
├── ゲームへの機密送金
└── ゲームからの機密報酬送金
```

### ラウンドデータのイメージ

```solidity
struct Round {
  uint256 startTime;
  uint256 endTime;
  RoundStatus status;
  euint64 sunPool;
  euint64 moonPool;
  euint8 winningSide;
  address[] players;
}
```

プレイヤーごとの情報は別のmappingで保持します。

```solidity
mapping(uint256 roundId => mapping(address player => euint8 choice)) choices;
mapping(uint256 roundId => mapping(address player => euint64 stake)) stakes;
mapping(uint256 roundId => mapping(address player => euint64 reward)) rewards;
mapping(uint256 roundId => mapping(address player => bool submitted)) submitted;
```

### 主なFHE演算

- `FHE.eq` — 選択した陣営の判定
- `FHE.lt` — 2つのプールの比較
- `FHE.add` — プールや報酬の更新
- `FHE.mul` — 賭け金の2倍計算
- `FHE.select` — 暗号化条件に基づくプール・報酬の更新
- `FHE.randEbool` — 同額時のランダム決着

## 8. 技術スタックとモノレポ構成

### 8.1 技術選定の方針

本プロジェクトは、**Bun Workspaces +
Turborepo**によるモノレポとして構成します。コントラクト、FHEクライアント、ABI・デプロイ情報、UIコンポーネント、Webアプリを分離し、次の原則を守ります。

- Zamaのバージョン互換性を最優先し、現行テンプレートのHardhat 2系を維持する。
- コントラクトのABIとアドレスを手作業でフロントへコピーしない。
- FHE暗号化・復号処理をWebコンポーネントから分離する。
- UIパッケージはWeb3ライブラリへ依存させない。
- ブロックチェーンを正本とし、MVPでは独自バックエンドやデータベースを持たない。
- ローカルMock FHEVM、永続ローカルノード、Sepolia実環境の3段階で検証する。
- すべての依存バージョンを`bun.lock`で固定する。

ReactをViteでビルドするSPAは`apps/web`からワークスペース内の共有パッケージを直接importし、Viteの依存解決とTurborepoのタスク順序でビルドします。Turborepoでは`dependsOn: ["^build"]`によって依存パッケージを先にビルドし、各パッケージの`dist/**`をキャッシュします。ブラウザへ置けないPrivy/Pimlicoの秘密情報だけは、独立した`apps/sponsor-api`に隔離します。

### 8.2 採用技術一覧

| レイヤー               | 採用技術                               | バージョン方針          | 用途                                             |
| ---------------------- | -------------------------------------- | ----------------------- | ------------------------------------------------ |
| Runtime                | Node.js                                | `>=20.19`               | Hardhat、Vite、スポンサーAPI、CIの実行環境       |
| Package Manager        | Bun                                    | `1.3+`                  | Workspaces、依存管理、スクリプト実行             |
| Monorepo               | Bun Workspaces                         | ルートで管理            | パッケージ間の依存解決                           |
| Task Runner            | Turborepo                              | `2.x`の安定版を固定     | build、test、lint、typecheckの並列化とキャッシュ |
| Smart Contract         | Solidity                               | `0.8.27`                | ゲームとERC-7984トークン                         |
| Contract Framework     | Hardhat                                | 現行の`2.28.x`を維持    | コンパイル、テスト、デプロイ、検証               |
| FHE Contract Library   | `@fhevm/solidity`                      | 現行の`0.11.1`を固定    | 暗号化型、演算、ACL、乱数                        |
| FHE Test Plugin        | `@fhevm/hardhat-plugin`                | 現行の`0.4.2`を固定     | Mock FHEVM、暗号化、復号、テスト支援             |
| FHE Frontend SDK       | `@zama-fhe/relayer-sdk`                | `0.4.1`を厳密に固定     | ブラウザでの暗号化、ユーザー復号、公開復号       |
| Confidential Token     | `@openzeppelin/confidential-contracts` | `0.5.3`を候補として固定 | ERC-7984と`IERC7984Receiver`                     |
| Contract Client        | Ethers                                 | `6.x`、現行は`6.16.x`   | Hardhatテスト、デプロイ、FHE SDKとの接続         |
| Generated Types        | TypeChain                              | Ethers v6 target        | 型安全なコントラクトテストとスクリプト           |
| Contract Test          | Mocha + Chai                           | 現行構成を維持          | FHEロジック、イベント、revertの検証              |
| Web Build Tool         | Vite + `@vitejs/plugin-react`          | 安定版を固定            | React SPAの開発、HMR、Production build           |
| UI Runtime             | React                                  | `19.x`の安定版を固定    | ゲーム画面と状態表現                             |
| Client Routing         | React Router                           | 安定版を固定            | Lobby、Round、Verify等のSPAルーティング          |
| Sponsor API            | Vercel Functions + TypeScript          | Node.js runtime         | Privy認証、UserOperation検証、Pimlico接続        |
| Language               | TypeScript                             | `5.9.x`                 | Web、SDK、スクリプト、共有型                     |
| Authentication         | Privy React Auth                       | 安定版を固定            | メールOTP、セッション、外部ウォレット接続        |
| Embedded Wallet        | Privy Embedded Ethereum Wallet         | Login時に自動作成       | Smart Accountのowner、FHE復号署名                |
| Wallet / Chain State   | wagmi + viem                           | 安定版を固定            | ウォレット接続、read/write、receipt監視          |
| Account Abstraction    | ERC-4337 + permissionless.js           | viem互換の安定版を固定  | Smart Account、UserOperation、バッチ実行         |
| Bundler / Paymaster    | Pimlico                                | Sepolia対応API          | UserOperation送信とガススポンサー                |
| Smart Account          | Simple Smart Account                   | ERC-4337対応版          | Privy Embedded Wallet等をownerとするアカウント   |
| Async Cache            | TanStack Query                         | wagmi互換版             | RPC結果、トランザクション状態、再取得            |
| Wallet UI              | Privy Login Modal + 独自Account UI     | MVP着手時に固定         | Email Login、Embedded Wallet、MetaMask接続       |
| Styling / Layout       | Lism CSS                               | `1.1.x`を固定           | レイアウト、デザイントークン、レスポンシブUI     |
| UI Components          | `@lism-css/ui`                         | Lism CSS互換版を固定    | Modal、Accordion、Tabs等の対話部品               |
| PWA                    | `vite-plugin-pwa` + Workbox            | 安定版を固定            | Manifest生成、SWビルド、静的オフライン対応       |
| Animation              | Motion                                 | 安定版を固定            | Seal、Reveal、勝敗演出                           |
| Validation             | Zod                                    | 安定版を固定            | 環境変数、フォーム、コールバックデータの検証     |
| Web Unit Test          | Vitest + Testing Library               | 安定版を固定            | Hooks、状態遷移、UIコンポーネント                |
| E2E Test               | Playwright                             | 安定版を固定            | ウォレット以外の主要導線とMock環境               |
| Lint / Format          | Biome + Solhint                        | ルート設定を共有        | React/TS/CSS/JSONとSolidityの品質管理            |
| Supplemental Formatter | Prettier + Solidity plugin             | 対象を限定              | Solidity、Markdown、YAMLのみ整形                 |
| Dead Code              | Knip                                   | CIで実行                | 未使用ファイル、export、依存関係の検出           |
| Duplication            | jscpd                                  | 初期上限8%              | TS/TSX/Solidityの重複増加を防止                  |
| CI                     | GitHub Actions                         | リポジトリ内で固定      | compile、typecheck、test、lint、build            |
| Web Hosting            | Vercel Static Deployment               | Production / Preview    | Vite SPAの公開デモとPRプレビュー                 |
| Sponsor API Hosting    | Vercel Serverless Functions            | Webとは別Project        | Paymaster秘密情報、認証、スポンサー判定          |
| Chain                  | Ethereum Sepolia                       | Chain ID `11155111`     | 提出対象ネットワーク                             |
| RPC                    | Infura                                 | 環境変数で切り替え      | HardhatとWebのSepolia接続                        |
| Contract Verification  | Etherscan + Sourcify                   | Hardhatから実行         | ソースコードとABIの公開検証                      |

OpenZeppelin Confidential Contracts
`0.5.3`は、現在のテンプレートと同じ`@fhevm/hardhat-plugin 0.4.2`、`@fhevm/solidity 0.11.1`、Relayer SDK `0.4.1`、Hardhat
2系を開発依存に使用しているため、互換性の基準として採用しやすい構成です。ただし、実装開始時にコンパイルと最小転送テストを通してから正式固定します。

### 8.3 Hardhat 2を維持する理由

このリポジトリは現在、Hardhat
`2.28.x`と`@fhevm/hardhat-plugin 0.4.2`で動作しています。一般的な新規プロジェクトとしてHardhat
3を選ぶ余地はありますが、本プロジェクトではFHEVMプラグイン、OpenZeppelin Confidential Contracts、Relayer
SDKの組み合わせを優先し、バウンティ提出前の移行は行いません。

- FHEVM公式テンプレートと同じ実行モデルを維持できる。
- 既存のMocha / Chai / Ethers v6テストを再利用できる。
- Hardhat 3移行による設定・プラグイン互換性の調査を避けられる。
- ローカルMockとSepolia実暗号化の差分検証に時間を使える。

Hardhat 3への移行は、提出後に全FHEVM依存の公式対応が確認できた時点で別タスクとして検討します。

### 8.4 モノレポ全体構成

```text
minority-rush/
├── apps/
│   ├── web/                         # React + Viteの公開SPA
│   │   ├── src/
│   │   │   ├── main.tsx            # Browser起動点
│   │   │   ├── app.tsx             # ProviderとRouterの組み立て
│   │   │   ├── routes/
│   │   │   │   ├── landing.tsx     # /
│   │   │   │   ├── lobby.tsx       # /play
│   │   │   │   ├── round.tsx       # /play/:roundId
│   │   │   │   ├── verify.tsx      # /verify/:roundId
│   │   │   │   └── collection.tsx  # /collection
│   │   │   ├── providers/
│   │   │   │   └── app-providers.tsx # Privy、Wagmi、Query
│   │   │   ├── components/
│   │   │   │   ├── auth/           # Email Login、Session、Account
│   │   │   │   ├── game/           # ゲーム固有UI
│   │   │   │   ├── pwa/            # Install、更新、Offline表示
│   │   │   │   └── wallet/         # 接続、ネットワーク切替
│   │   │   ├── hooks/               # 画面向けHooks
│   │   │   ├── lib/
│   │   │   │   ├── env.ts          # VITE_*公開変数の検証
│   │   │   │   ├── account-abstraction.ts
│   │   │   │   ├── privy.ts        # Privy設定とWallet選択
│   │   │   │   ├── pwa.ts          # Install・更新状態の補助関数
│   │   │   │   ├── wagmi.ts        # Sepolia設定
│   │   │   │   └── query-client.ts
│   │   │   ├── styles/
│   │   │   │   ├── global.css
│   │   │   │   ├── theme.css       # Lismデザイントークン上書き
│   │   │   │   ├── components.css  # c--*カスタムコンポーネント
│   │   │   │   └── utilities.css
│   │   │   ├── sw.ts               # WorkboxカスタムService Worker
│   │   │   └── vite-env.d.ts
│   │   ├── public/
│   │   │   ├── icons/               # 192/512/maskable/apple-touch
│   │   │   ├── sounds/
│   │   │   └── screenshots/         # Install UI用スクリーンショット
│   │   ├── tests/
│   │   ├── index.html
│   │   ├── vite.config.ts           # React、PWA、build設定
│   │   ├── vercel.json              # SPA deep linkのrewrite
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sponsor-api/                 # ブラウザへ出せない秘密情報の境界
│       ├── api/
│       │   └── sponsor.ts           # POST /api/sponsor entry
│       ├── src/
│       │   ├── auth/
│       │   │   └── verify-privy-token.ts
│       │   └── sponsorship/
│       │       └── validate-user-operation.ts
│       ├── tests/
│       ├── vercel.json
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── contracts/                   # Hardhat + Solidity
│   │   ├── contracts/
│   │   │   ├── MinorityRushGame.sol
│   │   │   ├── RushChip.sol
│   │   │   ├── interfaces/
│   │   │   │   └── IMinorityRushGame.sol
│   │   │   ├── libraries/
│   │   │   │   └── RoundLogic.sol
│   │   │   └── mocks/
│   │   ├── deploy/
│   │   │   ├── 00_deploy_chip.ts
│   │   │   └── 01_deploy_game.ts
│   │   ├── scripts/
│   │   │   ├── seed-faucet.ts
│   │   │   ├── create-round.ts
│   │   │   └── sync-deployments.ts
│   │   ├── tasks/
│   │   ├── test/
│   │   │   ├── unit/                # 高速Mock FHEVMテスト
│   │   │   ├── integration/         # Game + Token統合テスト
│   │   │   └── sepolia/             # 実暗号化Smoke Test
│   │   ├── deployments/             # hardhat-deploy生成物
│   │   ├── hardhat.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── contract-bindings/           # Webへ公開するABI・アドレス・型
│   │   ├── src/
│   │   │   ├── abi/
│   │   │   │   ├── minorityRushGame.ts
│   │   │   │   └── rushChip.ts
│   │   │   ├── addresses/
│   │   │   │   ├── localhost.ts
│   │   │   │   └── sepolia.ts
│   │   │   ├── chains.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── fhe-client/                  # FHEとコントラクト操作の境界
│   │   ├── src/
│   │   │   ├── relayer/
│   │   │   │   ├── create-instance.ts
│   │   │   │   └── signer-adapter.ts
│   │   │   ├── encryption/
│   │   │   │   └── encrypt-entry.ts
│   │   │   ├── decryption/
│   │   │   │   ├── decrypt-balance.ts
│   │   │   │   ├── decrypt-reward.ts
│   │   │   │   └── public-decrypt-result.ts
│   │   │   ├── actions/
│   │   │   │   ├── enter-round.ts
│   │   │   │   ├── settle-round.ts
│   │   │   │   └── claim-reward.ts
│   │   │   ├── account-abstraction/
│   │   │   │   ├── create-smart-account.ts
│   │   │   │   ├── send-sponsored-user-operation.ts
│   │   │   │   └── wait-for-user-operation.ts
│   │   │   ├── errors.ts
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                          # Web3非依存の共通UI
│   │   ├── src/
│   │   │   ├── button.tsx
│   │   │   ├── secret-stake-slider.tsx
│   │   │   ├── countdown.tsx
│   │   │   ├── transaction-status.tsx
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                      # 共有設定
│       ├── typescript/
│       └── package.json
│
├── docs/
│   ├── architecture.md
│   ├── confidentiality-model.md
│   ├── deployment.md
│   ├── demo-script.md
│   └── threat-model.md
├── e2e/
│   ├── fixtures/
│   └── game-flow.spec.ts
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-preview.yml
├── .env.example
├── .jscpd.json                       # 重複率8%を超えたら失敗
├── biome.json                        # React/TS/CSS/JSONのlint・format
├── bun.lock
├── bunfig.toml
├── knip.json                         # 未使用コード・依存検出
├── package.json
├── turbo.json
├── tsconfig.base.json
├── MINORITY_RUSH_CONCEPT.md
└── README.md
```

### 8.5 パッケージごとの責務

#### `apps/web`

ユーザーが操作する唯一の公開アプリです。ウォレット接続、Smart
Account作成、スポンサー付きUserOperation、ゲーム画面、トランザクション状態、復号結果、検証画面を担当します。暗号化処理やERC-4337の組み立てをReactコンポーネントへ直接実装せず、`@minority-rush/fhe-client`を呼び出します。

#### `apps/sponsor-api`

Privy Access
Tokenを検証し、許可されたSepoliaのUserOperationだけをPimlicoへスポンサー申請するステートレスAPIです。Paymaster API
KeyとPolicy IDを保持する唯一のアプリとし、ゲーム状態、メールアドレス、復号結果は保存しません。Vite SPAとは別のVercel
Projectとしてデプロイします。

#### `packages/contracts`

Solidity、Hardhat設定、デプロイスクリプト、タスク、コントラクトテストを保持します。WebアプリやReactへ依存してはいけません。現在ルートにある`contracts/`、`deploy/`、`tasks/`、`test/`、`hardhat.config.ts`は、モノレポ移行時にこのパッケージへ移します。

#### `packages/contract-bindings`

Webから安全に利用できるABI、ネットワークごとのアドレス、チェーン設定だけを公開します。Hardhatの巨大な`artifacts/`やTypeChain出力全体をWebへ直接importしません。`sync-deployments.ts`がデプロイ結果から必要なファイルを生成します。

#### `packages/fhe-client`

Relayer SDKの初期化、入力暗号化、ユーザー復号、公開復号、署名要求、Smart
Account初期化、UserOperation送信、トランザクション組み立てを担当します。Web側が暗号化ハンドル、証明、Bundler、Paymasterの細部を意識しないためのAnti-Corruption
Layerとして扱います。

#### `packages/ui`

Lism
CSSのReactプリミティブを利用したボタン、スライダー、カウントダウン、Toast、結果演出など、Web3に依存しない表示部品を保持します。StorybookはMVPでは導入せず、必要になった場合のみ追加します。

#### `packages/config`

TypeScriptの共有設定を保持します。Biome、Knip、jscpdはリポジトリ全体を解析するためルート設定とし、Solidity用Solhint設定は`packages/contracts`側に置きます。

### 8.6 依存方向

```text
apps/web
├── packages/ui
├── packages/fhe-client
└── packages/contract-bindings

apps/sponsor-api
└── packages/contract-bindings

packages/fhe-client
├── packages/contract-bindings
├── permissionless.js
└── viem

packages/contracts
└── Solidity / Hardhat / FHEVM / OpenZeppelin

packages/ui
└── Reactのみ（wagmi、viem、ethers、FHEVMへ依存しない）
```

禁止する依存は次のとおりです。

- `packages/contracts`から`apps/web`を参照しない。
- `apps/web`からHardhatの`artifacts/`を直接参照しない。
- Reactコンポーネント内でRelayer SDKを直接初期化しない。
- Reactコンポーネント内でBundler / Paymaster Clientを直接初期化しない。
- ABIやSepoliaアドレスを複数ファイルへ手書きしない。
- `packages/ui`へウォレット状態やコントラクト状態を持ち込まない。
- Tailwind CSSとLism CSSを併用せず、スタイルシステムを二重化しない。

### 8.7 フロントエンドのWeb3構成

`apps/web/src/providers/app-providers.tsx`で次の順序にProviderを構成し、`app.tsx`の`RouterProvider`を包みます。

```text
PrivyProvider
└── WagmiProvider
    └── QueryClientProvider
        └── Application
```

責務は次のように分けます。

- **Privy React Auth**: メールOTP、セッション、Embedded Wallet、外部ウォレット接続。
- **wagmi / viem**: アカウント、ネットワーク、read/write、receipt監視。
- **TanStack Query**: RPCレスポンスとラウンド状態のキャッシュ・再取得。
- **Relayer SDK**: FHE入力の生成、ユーザー復号、公開復号。
- **Ethers BrowserProvider Adapter**: Relayer SDKがEthers Signerを必要とする箇所だけで利用。
- **React local state**: 選択中の陣営、スライダー値、モーダル状態。

グローバル状態管理ライブラリは初期MVPでは導入しません。オンチェーン状態はTanStack
Query、画面内状態はReactで管理し、複雑化した場合のみZustandを追加します。

### 8.8 コントラクト構成

#### `RushChip.sol`

- OpenZeppelin `ERC7984ObserverAccess`を継承する。
- テスト用Faucetまたは管理者による初期配布を提供する。
- 残高と送金額を暗号化状態で保持する。
- 本番価値を持つ資産として扱わない。
- Smart Accountが所有する残高をowner EOAが復号できるよう、ownerをobserverとして登録する。

#### `MinorityRushGame.sol`

- `IERC7984Receiver`を実装する。
- `confidentialTransferAndCall`のコールバックで賭け金を受け取る。
- 受信した暗号化金額と暗号化された陣営選択をラウンドへ記録する。
- 暗号化プールを`FHE.select`と`FHE.add`で更新する。
- ラウンド終了時に`FHE.lt`、`FHE.eq`、`FHE.randEbool`で勝者を決める。
- 各プレイヤーへの報酬を暗号化状態で計算する。
- `RushChip.observer(playerSmartAccount)`を復号権限の受取先として使用する。
- Smart Account本人に加えて、登録済みowner EOAへ報酬のACLを付与する。
- 返却する`ebool`にトークンコントラクトのACL権限を付与する。

#### `RoundLogic.sol`

再利用可能な純粋ロジックと暗号化演算を保持します。ただし、ACL付与とストレージ更新が複雑になる場合は、無理にライブラリへ分離せず`MinorityRushGame`に残します。

### 8.9 ABI・デプロイ情報の同期

`packages/contracts/scripts/sync-deployments.ts`を単一の生成経路にします。

1. Hardhatでコントラクトをコンパイルする。
2. `hardhat-deploy`でローカルまたはSepoliaへデプロイする。
3. デプロイJSONからアドレスと必要なABIだけを抽出する。
4. `packages/contract-bindings/src`へTypeScriptファイルとして生成する。
5. Webアプリを型チェックし、ABIと呼び出しコードの不整合を検出する。

生成ファイルには秘密鍵、RPC URL、デプロイヤー情報を含めません。

### 8.10 環境変数

#### ルートまたは`packages/contracts/.env`

```dotenv
PRIVATE_KEY=
INFURA_API_KEY=
ETHERSCAN_API_KEY=
```

- `PRIVATE_KEY`はデプロイとSepoliaタスクだけで使用する。
- `.env`はGitへコミットしない。
- CIではGitHub Actions Secretsから注入する。
- ローカルMockテストは秘密鍵なしで実行可能にする。

#### `apps/web/.env.local`

```dotenv
VITE_PRIVY_APP_ID=
VITE_PRIVY_CLIENT_ID=
VITE_CHAIN_ID=11155111
VITE_SEPOLIA_RPC_URL=
VITE_GAME_ADDRESS=
VITE_RUSH_CHIP_ADDRESS=
VITE_SPONSOR_API_URL=
```

Viteの`VITE_*`は`import.meta.env`から参照でき、Production buildへ文字列として埋め込まれます。そのため、Privy App
ID、公開RPC
URL、コントラクトアドレス、スポンサーAPIの公開URLなど、ブラウザへ見えてよい値だけを置きます。秘密鍵、Paymaster API
Key、Privy App
Secret、管理者シークレット、署名用秘密情報は絶対に入れません。コントラクトアドレスは原則として`contract-bindings`から取得し、Vercel
Previewなどで上書きが必要な場合だけ環境変数を利用します。

#### `apps/sponsor-api/.env.local`

```dotenv
PRIVY_APP_SECRET=
PIMLICO_API_KEY=
PIMLICO_SPONSORSHIP_POLICY_ID=
ALLOWED_WEB_ORIGIN=
```

これらはスポンサーAPIのServerless実行環境だけへ設定し、`apps/web`のビルド時環境、Previewのクライアント変数、ログ、レスポンスへ含めません。WebからはPrivy
Access TokenをBearer Tokenとして送信し、API側で署名・issuer・audience・有効期限を検証します。

### 8.11 ルートスクリプト

ルート`package.json`には、日常的に必要な操作だけを公開します。

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "compile": "turbo compile --filter=@minority-rush/contracts",
    "test": "turbo test",
    "test:contracts": "bun --cwd packages/contracts test",
    "test:sepolia": "bun --cwd packages/contracts test:sepolia",
    "test:e2e": "playwright test",
    "check": "bun run biome:check && bun run lint:sol && bun run prettier:check && bun run typecheck && bun run knip && bun run jscpd",
    "biome:check": "biome check --files-ignore-unknown=true .",
    "biome:write": "biome check --write --files-ignore-unknown=true .",
    "lint": "turbo lint && bun run lint:sol",
    "lint:sol": "solhint --max-warnings 0 \"packages/contracts/contracts/**/*.sol\"",
    "typecheck": "turbo typecheck",
    "format:check": "biome format --files-ignore-unknown=true . && prettier --check \"**/*.{md,sol,yaml,yml}\"",
    "format:write": "biome format --write --files-ignore-unknown=true . && prettier --write \"**/*.{md,sol,yaml,yml}\"",
    "knip": "knip",
    "jscpd": "jscpd",
    "deploy:sepolia": "bun --cwd packages/contracts deploy:sepolia",
    "sync:deployments": "bun --cwd packages/contracts sync:deployments"
  }
}
```

`turbo.json`では、`build`が依存パッケージの`build`に依存し、`dev`はキャッシュせず常駐タスクとして扱います。

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "compile": {
      "outputs": ["artifacts/**", "types/**"]
    },
    "build": {
      "dependsOn": ["^build", "compile"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

実装時には、Hardhatコンパイルが必要なタスクだけが`compile`へ依存するよう調整し、Webの変更だけで毎回Solidityを再コンパイルしない構成にします。

### 8.12 テスト戦略

#### Contract Unit Test

HardhatのインメモリMock FHEVMを使い、最も高速に回します。

- 二重参加を拒否する。
- ラウンド期間外の参加を拒否する。
- SUN / MOONの暗号化プールが正しく更新される。
- 少ない側が勝者になる。
- 同額時だけ暗号化乱数が使われる。
- 勝者の報酬が賭け金の2倍になる。
- 敗者の報酬がゼロになる。
- ACLを持たない第三者が復号できない。
- コントラクトと本人には必要なACLが付与される。
- `IERC7984Receiver`の戻り値にトークンのACLが付与される。

#### Contract Integration Test

`RushChip`と`MinorityRushGame`を同時にデプロイし、複数Signerでラウンド全体を実行します。暗号化、送金、コールバック、settle、報酬送金、ユーザー復号までを確認します。

#### Sepolia Smoke Test

実暗号化環境では時間とガスを消費するため、少数の正常系に限定します。

- デプロイ済みアドレスのFHEVM互換性確認。
- 2プレイヤーの参加。
- 暗号化プールの更新。
- ラウンドsettle。
- 本人による残高・報酬のユーザー復号。
- 公開結果の復号と証明検証。

#### Web Unit Test

- ウォレット未接続、誤ネットワーク、接続済みの表示。
- Draft / Open / Sealed / Settling / Revealedの画面状態。
- トランザクション拒否、失敗、pending、confirmedの表示。
- タイマー終了時の操作禁止。
- 復号失敗時のリトライ。

#### E2E Test

永続ローカルMockノードを起動し、少なくとも次の導線を自動化します。

1. Faucetでチップを取得する。
2. ラウンドへ参加する。
3. 選択をSealする。
4. ラウンドをsettleする。
5. 結果をRevealする。
6. 残高と報酬を確認する。
7. Manifest、Service Worker、Install UIを確認する。
8. オフライン時にトランザクション操作が無効化されることを確認する。

### 8.13 ローカル・Sepoliaの環境分離

| 環境                     | 暗号化   | 永続性           | 主用途                     |
| ------------------------ | -------- | ---------------- | -------------------------- |
| Hardhat in-memory        | Mock     | なし             | Unit Test、CI、カバレッジ  |
| Hardhat Node / localhost | Mock     | プロセス中はあり | Web統合、E2E、デモ練習     |
| Ethereum Sepolia         | 実暗号化 | あり             | 提出用デモ、最終Smoke Test |

ローカルMockが通ってもSepolia上の復号時間、ACL、Relayer
SDK、RPC挙動までは保証されません。コントラクトの主要フローが完成した時点で早めにSepoliaへデプロイし、最後の週まで実環境確認を延期しない方針とします。

### 8.14 CI/CD

Pull Requestごとに次の順序で実行します。

1. `bun install --frozen-lockfile`
2. Solidity compile
3. ABI・型生成
4. TypeScript typecheck
5. Contract unit / integration test
6. Web unit test
7. Biome / Solhint / 対象限定Prettier check
8. Knipによる未使用コード・依存検出
9. jscpdによる重複率チェック
10. Vite production build
11. 必要に応じてPlaywright E2E

Sepoliaデプロイは通常のPRでは実行しません。手動実行または保護された`main`デプロイジョブからのみ行い、秘密鍵をPreview環境へ渡さないようにします。WebはVercel
Previewで確認し、本番ブランチの承認後にProductionへ反映します。React
Routerの`/play/:roundId`等へ直接アクセスできるよう、`apps/web/vercel.json`で非Assetリクエストを`/index.html`へrewriteします。

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 8.15 サーバー境界とデータベース

MVPでは汎用バックエンドとデータベースを導入しません。ただし、Vite SPAへPaymaster API
KeyとスポンサーPolicyを埋め込めないため、`apps/sponsor-api`としてステートレスな最小スポンサーAPIを必須とします。Webとは別のVercel
ProjectへServerless Functionとしてデプロイし、独立した環境変数とデプロイ権限を設定します。

- ラウンド状態はコントラクトから取得する。
- 履歴はイベントログから取得する。
- settleは特権Keeperではなく、期限後に誰でも呼べる関数にする。
- Webが期限到達時にsettleを呼び出し、失敗時は別ユーザーも再実行できる。
- 個人の秘密情報を外部DBへ複製しない。
- サーバー側はUserOperationを検証してPaymasterへ中継するだけとし、ゲーム状態を保持しない。
- Paymaster API KeyとPolicy IDはサーバー環境変数だけで管理する。

イベント数が増え、RPCによる履歴取得がUX上の問題になった場合のみ、提出後にインデクサーを追加します。The
Graph等を導入する場合も、公開イベントだけを扱い、復号値や個人の秘密情報は保存しません。

### 8.16 セキュリティ上の実装ルール

- 暗号化入力は必ず`FHE.fromExternal`と入力証明で検証する。
- 保存する暗号文には、次回計算用の`FHE.allowThis`を付ける。
- ユーザー復号値には、コントラクトと対象ユーザーの両方へACLを付ける。
- ERC-7984 callbackの呼び出し元が正しい`RushChip`であることを検証する。
- `IERC7984Receiver`の`ebool`戻り値をトークンが参照できるようACLを付ける。
- callback内で手動refundして`false`を返す二重返金パターンを禁止する。
- Checks-Effects-Interactionsとreentrancy対策を適用する。
- 参加者数に上限を設け、settleのループがガス上限を超えないようにする。
- 平文イベントにchoice、stake、reward、balanceを出力しない。
- フロントの`VITE_*`に秘密情報を置かない。
- 乱数は表示用の`Math.random()`ではなく、ゲーム結果には`FHE.randEbool()`を使用する。

### 8.17 Privy Email Login設計

標準ログイン方法としてPrivyのメールOTPを採用します。Web3ウォレットを持たないプレイヤーはメールアドレスだけでログインでき、ログイン時にPrivy
Embedded Ethereum Walletを自動作成します。このEmbedded WalletをERC-4337 Smart
AccountのownerとFHEユーザー復号の署名者として利用します。

既存のMetaMask等を使いたいプレイヤー向けに、外部ウォレットログインも残します。

#### PrivyProvider

`apps/web/src/providers/app-providers.tsx`の最上位で`PrivyProvider`を設定します。

```tsx
import { PrivyProvider } from "@privy-io/react-auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      clientId={import.meta.env.VITE_PRIVY_CLIENT_ID}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

#### ログインフロー

1. Landingで`Play with email`を押す。
2. メールアドレスを入力する。
3. メールへ届いたOTPを入力する。
4. Privyセッションが作成される。
5. Web3ウォレットを持たないユーザーにはEmbedded Walletが自動作成される。
6. Embedded WalletをownerとするSmart Accountアドレスを導出する。
7. 最初のPlay操作時にSmart Account、observer、Faucetをガスレスで初期化する。
8. 以降はメールログインだけで同じEmbedded WalletとSmart Accountを復元する。

画面上ではEmbedded WalletとSmart
Accountの違いを常時説明せず、Account画面で詳細を確認できるようにします。通常のゲーム画面では「Signed in」「Gas
sponsored」「Private balance」の3点だけを分かりやすく表示します。

#### Embedded Walletの取得

Privyの`useWallets`から`walletClientType === "privy"`のウォレットを選び、EIP-1193 Providerを取得します。

```ts
import { useWallets } from "@privy-io/react-auth";

const { wallets } = useWallets();
const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");
const provider = await embeddedWallet?.getEthereumProvider();
```

このProviderを次の用途で共有します。

- viem Wallet Clientのtransport。
- permissionless.js Smart Accountのowner signer。
- UserOperation署名。
- Relayer SDKが要求するEthers BrowserProvider / Signerへの変換。
- FHEユーザー復号で必要となるEIP-712署名。

#### FHEユーザー復号

Privy Embedded WalletはEIP-1193 Providerを通してtyped dataへ署名します。Zama Relayer
SDKのユーザー復号で要求される署名を、Embedded Walletのownerアドレスから生成します。

```ts
const accounts = await provider.request({ method: "eth_requestAccounts" });
const signature = await provider.request({
  method: "eth_signTypedData_v4",
  params: [accounts[0], typedData],
});
```

本実装に入る前に、Privy Embedded WalletでZamaのuser
decryptが成功する最小スパイクを作成し、Sepoliaで検証します。ここが成功しない場合はゲーム全体のログイン方式に影響するため、最優先の技術検証項目とします。

#### Sponsor APIの認証

ブラウザから`/api/sponsor`を呼ぶ際はPrivy Access Tokenを送信します。Route
Handlerは`@privy-io/node`でトークンを検証し、認証済みPrivy Userだけにスポンサー処理を許可します。

- 未認証リクエストを拒否する。
- Privy DID、owner wallet、Smart Accountの対応を検証する。
- Privy DID単位でもrate limitを適用する。
- メールアドレスをPaymaster、Bundler、コントラクトへ渡さない。
- Access Token、OTP、メールアドレスをログへ出力しない。
- Service WorkerやCache StorageへAccess Tokenを保存しない。

#### アカウントとプライバシー

- メールアドレスはPrivy認証にだけ使用し、オンチェーンへ書き込まない。
- イベントにはEmbedded WalletとSmart Accountのアドレスだけが現れる。
- 公開プロフィールへメールアドレスを表示しない。
- ログアウト時はメモリ上の復号値とゲーム内一時状態を破棄する。
- 共用端末では残高・勝敗の復号結果を永続保存しない。
- Account画面から外部ウォレットのリンク、ログアウト、利用可能な場合はwallet export / recovery導線を提供する。
- メール変更・アカウント復旧はPrivyが提供する公式フローだけを利用する。

#### Privyテスト

- メールOTPログイン後にEmbedded Walletが1つ作成される。
- 再ログインしても同じEmbedded Walletが取得される。
- 外部ウォレットログインも利用できる。
- Embedded Walletから同じSmart Accountが導出される。
- Embedded WalletでUserOperationへ署名できる。
- Embedded WalletでZama user decryptのtyped dataへ署名できる。
- Privy Access Tokenがないスポンサーリクエストは拒否される。
- メールアドレス、OTP、Access TokenがログとCache Storageに残らない。
- ログアウト後に復号済み残高と勝敗が画面から消える。

### 8.18 Gasless / Account Abstraction設計

ガスレスUXはMVPの必須要件です。ERC-4337 Smart Account、Bundler、Paymasterを利用し、プレイヤーがSepolia
ETHを用意しなくてもFaucet、observer登録、ゲーム参加、settle、claimを実行できるようにします。

#### 採用構成

```text
Privy Embedded Wallet / External Wallet
       │ signs UserOperation
       ▼
Simple Smart Account
       │ sends UserOperation
       ▼
Pimlico Bundler ─── Pimlico Paymaster
       │                  │
       └──── EntryPoint ──┘
                  │
                  ▼
       RushChip / MinorityRushGame
```

- **Owner EOA**: Privy Embedded Walletを標準とし、UserOperationとFHEユーザー復号に署名する。外部ウォレットも選択できる。
- **Simple Smart Account**: ゲーム内トークンを所有し、コントラクトを呼び出すプレイヤーアドレス。
- **permissionless.js**: viem互換のSmart Account Client、UserOperation、Bundler / Paymaster連携。
- **Pimlico Bundler**: UserOperationをSepoliaへ送信する。
- **Pimlico Paymaster**: 許可されたゲーム操作のガスをスポンサーする。
- **EntryPoint**: ERC-4337 UserOperationを検証・実行する。

#### ガスレス対象操作

- Smart Accountの初回デプロイ。
- owner EOAのobserver登録。
- RushChip Faucetの利用。
- ラウンド作成または参加。
- `confidentialTransferAndCall`による暗号化された賭け。
- ラウンドのsettle。
- 報酬のclaim。

すべてを無条件でスポンサーするのではなく、Paymaster Policyで対象コントラクトと関数を制限します。

#### 初回オンボーディング

1. プレイヤーがメールOTPでPrivyへログインする。既存ユーザーは外部ウォレットも選択できる。
2. Privy Embedded Walletまたは接続EOAをownerとする決定論的なSmart Accountアドレスを計算する。
3. Smart
   Accountのデプロイ、`RushChip.setObserver(smartAccount, ownerEOA)`、Faucetを可能な範囲で1つのUserOperationへバッチする。
4. Pimlico PaymasterがUserOperationのガスをスポンサーする。
5. Receipt完了後、Smart Accountとowner EOAの対応を画面に表示する。
6. 次回以降は同じownerから同じSmart Accountを復元する。

ログイン直後にSmart Accountデプロイ署名を強制せず、最初にFaucetまたはPlayを押した時点でオンボーディングを開始します。

#### FHE ACLとの互換設計

Account Abstractionではゲームコントラクトから見た`msg.sender`がSmart
Accountになります。一方、ブラウザでユーザー復号の署名を行うのはowner EOAです。このアドレス差を次のように解決します。

1. `RushChip`は`ERC7984ObserverAccess`を継承する。
2. Smart Account自身から`setObserver(smartAccount, ownerEOA)`を呼び出す。
3. ERC-7984残高と転送額にはowner EOAのobserver ACLが付与される。
4. ゲーム参加時、`MinorityRushGame`は`RushChip.observer(playerSmartAccount)`を取得する。
5. observerが未登録の場合はゲーム参加を受け付けない。
6. ゲームの暗号化報酬と個人結果には、Smart Accountとowner EOAの両方へACLを付与する。
7. owner EOAはRelayer SDKを使って、自分に許可された残高・報酬・勝敗だけを復号する。

暗号化入力はコントラクトアドレスとSmart Accountアドレスに対して作成し、実際のコントラクト呼び出しはSmart
AccountのUserOperationとして送信します。

#### スポンサーAPI

PaymasterのAPI
Keyをブラウザへ公開しないため、`apps/sponsor-api/api/sponsor.ts`を最小のサーバー境界として設けます。このAPIは任意のトランザクションを中継せず、スポンサー判定に必要なUserOperation情報だけを受け取ります。WebのOriginをCORSで限定し、Privy
Access Tokenを検証してからPimlicoへ接続します。

- Sepolia以外を拒否する。
- 許可されたEntryPointだけを受け付ける。
- `RushChip`と`MinorityRushGame`以外へのcallを拒否する。
- 許可されたfunction selectorだけを受け付ける。
- callData、gas limit、batch件数の上限を検証する。
- IP、owner、Smart Account単位でrate limitを設定する。
- API Key、Policy ID、内部エラーをレスポンスへ含めない。
- UserOperationの内容をログへ残す場合も、暗号化proofや署名を全文保存しない。

#### Paymaster Policy

- Chain IDをSepolia `11155111`へ限定する。
- 対象アドレスをデプロイ済みGame / Tokenへ限定する。
- Faucetの回数と1日当たりスポンサー額を制限する。
- 1ウォレット当たりのUserOperation回数を制限する。
- 最大call gas、verification gas、pre-verification gasを制限する。
- 任意送金、任意call、ETH transferをスポンサーしない。
- ProductionとPreviewでAPI KeyとPolicyを分離する。
- Paymaster残高と失敗率を監視する。

#### UserOperation状態表示

通常のトランザクションハッシュだけでなく、次の状態をUIへ表示します。

```text
Awaiting signature
→ Sponsoring gas
→ Submitted to bundler
→ Included on Sepolia
→ FHE operation pending
→ Confirmed
```

UserOperation hashと最終transaction
hashの両方を保持し、失敗時にはBundlerエラー、Paymaster拒否、オンチェーンrevertを区別します。同じ操作を再試行する前に、参加済み状態や残高を再取得して二重実行を防ぎます。

#### AAテスト

- 同じownerから同じSmart Accountアドレスが導出される。
- 初回UserOperationでSmart Accountがデプロイされる。
- Paymaster付きUserOperationをSepoliaで送信できる。
- ownerがSepolia ETHを持たなくてもゲームへ参加できる。
- 許可されたGame / Token関数だけがスポンサーされる。
- 任意アドレスへの送金と未許可selectorが拒否される。
- rate limitとスポンサー上限が動作する。
- observer未登録のSmart Accountがゲームへ参加できない。
- owner EOAがSmart AccountのERC-7984残高を復号できる。
- 第三者EOAが残高・報酬・勝敗を復号できない。
- UserOperation再試行で二重参加しない。
- Paymaster停止時に、理由と復旧案をUIへ表示する。

### 8.19 Lism CSS設計

スタイルとレイアウトには[Lism CSS](https://lism-css.com/)を採用します。Lism
CSSはレイアウトプリミティブ、デザイントークン、プロパティクラス、コンテナクエリベースのレスポンシブ機能を持ち、Reactコンポーネントとしても利用できます。

#### 導入

`apps/web/src/main.tsx`でLism CSSをグローバルに読み込みます。

```tsx
import "lism-css/main.css";

import "./styles/theme.css";
import "./styles/components.css";
import "./styles/global.css";
```

レイアウトには`lism-css/react`のコンポーネントを使用します。

```tsx
import { Box, Grid, Heading, Stack, Text } from "lism-css/react";

export function ChoicePanel() {
  return (
    <Stack g="30">
      <Heading tag="h2" fz="xl">
        Pick a side
      </Heading>
      <Grid cols="2" g="20">
        <Box p="30" bgc="base-2" bdrs="20">
          <Text>Sun</Text>
        </Box>
        <Box p="30" bgc="base-2" bdrs="20">
          <Text>Moon</Text>
        </Box>
      </Grid>
    </Stack>
  );
}
```

#### 利用方針

- ページの骨格には`Stack`、`Grid`、`Flex`、`Center`、`Container`を使う。
- 余白、文字サイズ、角丸、色はLismのデザイントークンを優先する。
- レスポンシブ値はLismの配列Propsまたは`-{prop}_{bp}`を利用する。
- ゲーム固有のスタイルには`c--gameBoard`、`c--choiceCard`のような`c--*`クラスを使う。
- 状態表現には`is--selected`、`is--sealed`、`is--winner`のような`is--*`クラスを使う。
- 共有コンポーネントの基本形には必要に応じて`b--*`クラスを使う。
- 一時的な値以外でインラインstyleを乱用しない。
- Tailwind CSS、CSS Modules、CSS-in-JSを同一コンポーネントへ混在させない。

#### CSS Layer

Lism CSSの`@layer`構成を維持し、プロジェクト独自のスタイルは`lism-custom`へ配置します。

```css
@layer lism-custom {
  :root {
    --c-accent: #8b5cf6;
    --c-sun: #f59e0b;
    --c-moon: #6366f1;
  }

  .c--choiceCard {
    min-block-size: 10rem;
    transition:
      transform 160ms ease,
      border-color 160ms ease;
  }

  .c--choiceCard.is--selected {
    transform: translateY(-0.25rem);
  }
}
```

#### アクセシビリティ

- 陣営カードは`div`ではなく`button`または適切なフォームコントロールで実装する。
- 選択状態を色だけで表現せず、アイコン、テキスト、`aria-pressed`を併用する。
- フォーカスリングを削除しない。
- Motion演出は`prefers-reduced-motion`に従う。
- 最小44px程度のタップ領域を確保する。
- SUN / MOONの配色はWCAG AA相当のコントラストを確認する。

### 8.20 PWA設計

`vite-plugin-pwa`とWorkboxを使用し、ReactをViteでビルドするSPAをインストール可能なPWAとして提供します。PWAの目的は、モバイルから素早く再訪できること、全画面に近いゲーム体験を提供すること、静的な説明画面を低品質な通信環境でも表示できることです。

オンチェーンゲーム本体はネットワーク接続を必要とするため、**オフラインプレイが可能であるとは表現しません**。ウォレット署名、RPC、Relayer
SDK、暗号化、復号、トランザクション送信はオンライン時だけ有効にします。

#### Vite PWA設定とWeb App Manifest

`apps/web/vite.config.ts`でReact pluginとPWA
pluginを設定します。キャッシュ除外をコードで厳密に管理するため、Workboxの`injectManifest`方式を採用し、独自Service
Workerを`apps/web/src/sw.ts`に置きます。

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      manifest: {
        name: "Minority Rush",
        short_name: "Minority Rush",
        description: "One choice. One secret stake. Outsmart the crowd.",
        start_url: "/play",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#080b16",
        theme_color: "#080b16",
        categories: ["games", "entertainment"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
```

追加で以下を用意します。

- 192×192と512×512のPNGアイコン。
- Maskable icon。
- Apple Touch Icon。
- インストールUI用の縦長・横長スクリーンショット。
- `themeColor`、iOS向けWeb App metadata、適切なViewport設定。

#### Service Worker

`vite-plugin-pwa`がProduction build時に`src/sw.ts`をコンパイルし、precache
manifestを注入します。React側では`virtual:pwa-register/react`の`useRegisterSW`を使い、オフライン準備完了と更新待機をUIへ反映します。

```tsx
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  return (
    <aside role="status" aria-live="polite">
      {offlineReady ? "Ready for limited offline viewing" : "Update available"}
      {needRefresh && <button onClick={() => updateServiceWorker(true)}>Update</button>}
      <button onClick={() => (setOfflineReady(false), setNeedRefresh(false))}>Later</button>
    </aside>
  );
}
```

更新は`registerType: "prompt"`とし、トランザクション送信中や復号中にService
Workerが自動でページをリロードしないようにします。Service
Worker自身には`Cache-Control: no-cache, no-store, must-revalidate`を設定し、更新が長期間止まらないようにします。

#### キャッシュ方針

| リソース                     | 戦略                      | 理由                                         |
| ---------------------------- | ------------------------- | -------------------------------------------- |
| アイコン、フォント、静的画像 | Cache First               | 変更頻度が低く、再訪を高速化できる           |
| Landing、遊び方、免責事項    | Stale While Revalidate    | オフラインでも説明を表示できる               |
| Viteのhashed静的アセット     | Precache + revision       | アプリシェルを安全に高速化する               |
| ラウンド公開履歴             | Network First             | 古い勝敗を表示し続けないため                 |
| Ethereum RPC                 | Network Only              | チェーン状態の古いキャッシュを避ける         |
| Privy Auth / Session         | Network Only              | OTP、Access Token、セッションを保存しない    |
| Wallet Provider              | Network Only              | ウォレット接続をService Workerで横取りしない |
| Zama Relayer / KMS           | Network Only              | 暗号化・復号データを保存しない               |
| トランザクション送信         | Network Only              | 再送・二重送信を防ぐ                         |
| ユーザー復号結果             | Cache Storageへ保存しない | 秘密情報を端末共有キャッシュへ残さない       |

Service Workerの`fetch`ハンドラでは、Privy Auth、RPC
URL、スポンサーAPI、Relayer、KMS、`POST`、wallet関連リクエストをキャッシュ処理の対象外にします。Cache
Storage、IndexedDB、Local Storageへ、OTP、Privy Access Token、復号済みのchoice、stake、reward、balanceを永続化しません。

#### オフラインUX

- `navigator.onLine`と通信失敗を組み合わせて接続状態を表示する。
- オフライン時は画面上部へ明確なバナーを表示する。
- `Seal My Choice`、Faucet、settle、claim、decryptを無効化する。
- 遊び方、免責事項、過去に取得した公開情報だけを閲覧可能にする。
- 通信復帰時にTanStack Queryを再取得し、送信前にラウンド期限と参加状態を再確認する。
- オフライン中のトランザクションをバックグラウンド同期で自動送信しない。

#### Install UX

- Chromium系では`beforeinstallprompt`を保持し、ゲーム内の自然なタイミングでInstallボタンを表示する。
- 初回訪問直後に強制的なInstallモーダルを出さない。
- 1ラウンド完了後など、価値を体験した後に案内する。
- iOS Safariでは共有メニューから「ホーム画面に追加」する手順を表示する。
- `display-mode: standalone`でインストール済みか判定し、重複案内を避ける。

#### 更新UX

- 新しいService Workerがwaitingになったら「Update available」を表示する。
- トランザクションpending中や復号中には自動リロードしない。
- ユーザー操作で更新を適用し、安全な画面へ遷移してから再読み込みする。
- コントラクトアドレスやABIが変わるリリースでは、キャッシュバージョンも更新する。

#### PWAテスト

- HTTPS環境でManifestとService Workerが取得できる。
- 192px、512px、Maskable iconが存在する。
- `display: standalone`で起動できる。
- `/play`と`/play/:roundId`へ直接アクセスしてもVercel rewriteとReact Routerが正しく動く。
- オフライン時に静的説明画面を表示できる。
- オフライン時にゲーム操作が無効になる。
- RPC、Relayer、復号結果がCache Storageへ保存されない。
- Service Worker更新時にpendingトランザクションを失わない。
- LighthouseのPWA、Accessibility、Best Practicesを確認する。
- Android ChromeとiOS Safariの実機でインストール導線を確認する。

### 8.21 技術資料

- [Zama Protocol — Hardhat plugin](https://docs.zama.org/protocol/solidity-guides/development-guide/hardhat)
- [Zama Protocol — Deploy contracts and run tests](https://docs.zama.org/protocol/solidity-guides/development-guide/hardhat/run_test)
- [OpenZeppelin — ERC-7984](https://docs.openzeppelin.com/confidential-contracts/token)
- [OpenZeppelin — IERC7984Receiver](https://docs.openzeppelin.com/confidential-contracts/api/interfaces)
- [Vite — Getting Started](https://vite.dev/guide/)
- [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode)
- [vite-plugin-pwa — Advanced / injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest)
- [vite-plugin-pwa — React integration](https://vite-pwa-org.netlify.app/frameworks/react)
- [Vercel — Vite SPA deployment and rewrites](https://vercel.com/docs/frameworks/frontend/vite)
- [Biome — Configuration](https://biomejs.dev/reference/configuration/)
- [Knip — Monorepos and workspaces](https://knip.dev/features/monorepos-and-workspaces)
- [jscpd — Configuration](https://github.com/kucherenko/jscpd)
- [wagmi — React getting started](https://wagmi.sh/react/getting-started)
- [Turborepo — Configuring tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)
- [Lism CSS — Documentation](https://lism-css.com/docs/)
- [Lism CSS — GitHub](https://github.com/lism-css/core)
- [ERC-4337 specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Pimlico — Getting Started](https://docs.pimlico.io/guides/getting-started)
- [Pimlico — Sponsor transaction fees](https://docs.pimlico.io/guides/how-to/paymasters/sponsor-transaction-fees)
- [permissionless.js](https://docs.pimlico.io/references/permissionless)
- [OpenZeppelin — ERC7984ObserverAccess](https://docs.openzeppelin.com/confidential-contracts/api/token)
- [Privy — React setup](https://docs.privy.io/basics/react/setup)
- [Privy — Automatic wallet creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation)
- [Privy — Custom Account Abstraction implementation](https://docs.privy.io/recipes/account-abstraction/custom-implementation)
- [Privy — Access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens)

## 9. フロントエンド案

### 基本画面

1. **Landing**
   - ゲームを一文で説明
   - `Play with email` ボタン
   - 外部ウォレットで続ける導線
   - 機密性の説明を短いアニメーションで表示

2. **Lobby**
   - PrivyログインとEmbedded Wallet状態
   - Smart Account初期化状態
   - チップ残高の復号
   - ルーム作成または参加
   - 現在の参加人数

3. **Play**
   - SUN / MOONの大きな2つのボタン
   - Secret Stakeスライダー
   - 残り時間
   - `Seal My Choice` ボタン

4. **Sealed**
   - 選択が暗号化されたことを視覚的に表示
   - 他のプレイヤーの参加状況
   - ブロックエクスプローラーを見ても内容が分からないことを説明

5. **Reveal**
   - 勝利陣営の演出
   - 自分の勝敗と報酬の復号
   - 公平性の検証リンク
   - 次のラウンドへの導線

6. **Collection**
   - 獲得したSigil
   - 連勝記録
   - プレイ回数

7. **PWA / Connectivity**
   - 1ラウンド完了後のInstall案内
   - iOS向け「ホーム画面に追加」ガイド
   - オフラインバナー
   - Service Worker更新通知

### UX方針

- モバイルファーストで設計する。
- 暗号化、ACL、復号などの専門用語を主操作画面に出しすぎない。
- トランザクション待機を「Sealing」「Computing」「Revealing」の演出に変える。
- トランザクション完了前後を明確に表示する。
- 失敗した場合は再試行できる導線を用意する。
- 1ラウンドのプレイ時間は45〜90秒を目安にする。
- Lism CSSのレイアウトプリミティブとデザイントークンを使用する。
- PWAのstandalone表示でもSafe Areaとウォレット遷移が崩れないようにする。

## 10. MVP Scope

### 必須

- [ ] Sepolia上のゲームコントラクト
- [ ] ERC-7984準拠のゲームチップ
- [ ] チップFaucet
- [ ] 2〜8人用ルーム
- [ ] 暗号化された陣営選択
- [ ] 暗号化された賭け金
- [ ] 暗号化された陣営別プール
- [ ] 勝利陣営のFHE判定
- [ ] 同額時のオンチェーン暗号化乱数
- [ ] プレイヤーごとの報酬計算
- [ ] 本人だけが復号できる勝敗と残高
- [ ] 公開結果の検証画面
- [ ] モバイル対応フロントエンド
- [ ] Lism CSSによるレスポンシブUI
- [ ] Web App ManifestとPWAアイコン
- [ ] Service Workerと安全なキャッシュポリシー
- [ ] Install UI、オフライン表示、更新通知
- [ ] PrivyメールOTPログイン
- [ ] Embedded Ethereum Walletの自動作成
- [ ] Embedded WalletによるZama user decrypt署名
- [ ] 外部ウォレットログインのフォールバック
- [ ] Privy Access TokenによるスポンサーAPI認証
- [ ] ERC-4337 Smart Account
- [ ] permissionless.jsによるUserOperation送信
- [ ] Pimlico Bundler / PaymasterによるSepoliaガススポンサー
- [ ] Paymaster PolicyとスポンサーAPIの制限
- [ ] `ERC7984ObserverAccess`によるowner EOAの復号権限
- [ ] Sepolia ETHを持たないユーザーのエンドツーエンドテスト
- [ ] コントラクトの単体・統合テスト
- [ ] READMEとアプリ内の免責事項
- [ ] 公開Webデモ

### 余裕があれば追加

- [ ] 連勝ボーナス
- [ ] 16種類程度のSigil収集
- [ ] デイリーチャレンジ
- [ ] ルーム共有用URLまたはQRコード
- [ ] サウンドと結果演出
- [ ] 観戦モード
- [ ] 過去ラウンドの検証ページ

### 初期MVPから外すもの

- 大人数のリアルタイム対戦
- ミリ秒単位の早押し判定
- 自由入力チャット
- 複雑なNFTマーケット
- 複数トークン対応
- プロポーショナルな複雑配当
- 本番価値を持つトークンや賞金

## 11. 審査基準への対応

### Gameplay and UX

- 基本操作は陣営選択と賭け金設定のみ。
- 1ラウンドが短く、繰り返し遊びやすい。
- 他の参加者を読む心理戦が毎回発生する。
- トランザクション待機をゲーム演出として利用する。
- Sepolia ETHを持たないユーザーもPaymaster経由で参加できる。

### Confidentiality Design

- 陣営、賭け金、合計プール、個人報酬を暗号化する。
- 選択と賭け金が公開されると、後発プレイヤーが有利になりゲームが崩壊する。
- 本人に必要な値だけを復号できる。

### Fairness

- 勝敗はスマートコントラクトの公開されたルールで計算する。
- 同額時の乱数はオンチェーンで暗号化生成する。
- 公開結果には復号証明を付ける。

### Functionality

- Sepoliaでルーム作成から報酬確認まで完結させる。
- ガスを持たないEOAからSmart Account経由でフルラウンドを完走できる。
- 2〜8人に制限し、確実に完走できる構成にする。
- ローカルFHEVMテストとSepolia統合テストを用意する。

### Demo Quality

- ルールを10〜15秒で説明できる。
- メールOTPだけでログインし、ウォレット準備なしで開始できることを実演できる。
- Sepolia ETH残高がゼロのウォレットでガスレス参加を実演できる。
- 2つのブラウザまたはウォレットを使い、情報が互いに見えないことを示せる。
- エクスプローラー上でも選択と賭け金が読めないことを示せる。
- 最後に勝利陣営と本人の報酬を復号する、分かりやすい見せ場がある。

### Code Quality

- ゲームロジック、トークン、復号処理を分離する。
- ACLと入力証明に関するテストを重視する。
- ラウンド状態遷移と二重参加をテストする。
- SolidityとTypeScriptの両方で適切なレイヤーのテストを用意する。

## 12. 3分デモ動画案

### 0:00〜0:20 — Problem

「透明なブロックチェーンでは、他人の選択と賭け金が見えるため、少数派ゲームは成立しません。」

### 0:20〜0:40 — Solution

Minority Rushでは、選択と賭け金を暗号化したままオンチェーンで比較します。誰も途中経過を盗み見ることはできません。

### 0:40〜1:30 — Gameplay

- メールアドレスでPrivyへログイン
- Embedded Walletが自動作成されることを表示
- Sepolia ETH残高がゼロであることを表示
- ガススポンサー付きSmart Accountを初期化
- 2人以上でルームに参加
- それぞれ異なる陣営と賭け金を選択
- 選択をSeal
- 参加済みだが内容は見えない状態を表示

### 1:30〜2:10 — Confidentiality and Fairness

- ブロックエクスプローラーを表示
- 選択と賭け金が平文で存在しないことを確認
- FHEで合計と勝敗を計算していることを説明
- 同額時にはオンチェーン暗号化乱数を使用することを説明

### 2:10〜2:40 — Reveal

- 勝利陣営を公開
- 各プレイヤーが自分の結果だけを復号
- 勝者の暗号化残高が増えていることを表示

### 2:40〜3:00 — Closing Pitch

「Minority Rush is not a game with privacy added. Privacy is the game.」

## 13. X投稿・スレッド案

1. Minority Rushの一文紹介とプレイ動画
2. 透明なチェーンで少数派ゲームが壊れる理由
3. 暗号化される情報の一覧
4. Zama ProtocolによるFHE計算
5. ERC-7984による秘密の残高と賭け金
6. ERC-4337とPaymasterによるガスレス参加
7. オンチェーン暗号化乱数と公平性
8. Sepoliaデモ、GitHub、動画へのリンク
9. 今後追加したい機能

## 14. 開発の優先順位

### Phase 1 — Core Contract

1. 暗号化された陣営選択
2. 暗号化されたプール更新
3. 勝利陣営の計算
4. プレイヤーごとの報酬計算
5. ACLと復号処理
6. ローカルテスト

### Phase 2 — Token Integration

1. ERC-7984チップ
2. Faucet
3. ゲームへの送金
4. 勝者への報酬送金
5. トークン統合テスト

### Phase 3 — Privy Auth / Gasless / Account Abstraction

1. PrivyメールOTPとEmbedded Wallet
2. Embedded WalletによるZama user decryptのSepoliaスパイク
3. permissionless.jsとSimple Smart Account
4. Pimlico Bundler / Paymaster
5. Privy認証付きスポンサーAPIとPolicy制限
6. `ERC7984ObserverAccess`によるowner EOAの復号
7. メールログイン・Sepolia ETHゼロのエンドツーエンドテスト

### Phase 4 — Frontend

1. Privyログイン・Account UI
2. Lobby
3. Play / Seal
4. Reveal
5. 残高復号
6. モバイル調整

### Phase 5 — Sepolia and Submission

1. Sepoliaデプロイ
2. エンドツーエンド確認
3. コントラクト検証
4. ドキュメント整備
5. 3分動画撮影
6. Xスレッド公開
7. 最終提出

## 15. プロジェクト名候補

- Minority Rush
- UnderCrowd
- Shadow Pick
- Veil Stakes
- Odd Pool

提出ガイドラインに従い、プロジェクト名には「Zama」を含めません。

## 16. 必須免責事項

以下の文言をREADMEとアプリ内の両方に表示します。

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

## 17. 参考資料

- [Zama Developer Program Mainnet Season 5](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming)
- [Zama Protocol Solidity Guides](https://docs.zama.org/protocol/solidity-guides)
- [Zama Protocol — Generate random numbers](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)
- [Zama Protocol — Access Control List](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl)
- [OpenZeppelin Confidential Contracts — ERC-7984](https://docs.openzeppelin.com/confidential-contracts/token)
- [trivia.tech紹介記事](https://dena.com/jp/news/5077/)
- [PushFi GitHubリポジトリ](https://github.com/mashharuki/PushFi)
