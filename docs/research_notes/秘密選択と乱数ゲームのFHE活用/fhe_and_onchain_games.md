# 秘密選択と乱数ゲームのFHE活用（既存ゲーム調査・FHE技術制約・必要性判定）

調査日: 2026-11-14。出典は全てWeb検索/取得結果に基づく。2024年以前の情報は「古い可能性」と明記。

## Q1. 隠し情報・秘密選択・乱数を使う既存のオンチェーンゲーム（commit-reveal / ZK / FHE / 人気ゲームの教訓）

### Takeaway
隠し情報ゲームの実例はZK(Dark Forest)とFHEハッカソン作品(poker系、Wordle、number guessing)が中心で、商業的に大きく成功した「隠し情報オンチェーンゲーム」は見つからなかった。商業的に伸びたのはAxie/Fantasy Topなど経済(トークン/NFT)主導のゲームで、いずれも経済モデル崩壊とともにユーザーが激減した。

### Cited Findings
- Dark Forest: 2020/8/2発表。zkSNARKによる「fog of war」でゲーム状態を全てオンチェーンに置いた初期例。xDai上で運用、1tx約$0.01(古い情報・2020-21年頃)。v0.3で約300人、v0.4で約600人、v0.6で約1,900人(ホワイトリスト、9日間)。0xPARCがIPを保有 — [Devlane](https://www.devlane.com/blog/what-is-zk-snark-application-in-dark-forest-game), [AltLayer docs](https://docs.altlayer.io/altlayer-documentation/flashlayer-showcase/dark-forest-community-round), [ZK podcast](https://zeroknowledge.fm/episode-141-zk-games-dark-forest-with-brian-gu)。ピーク規模は千人台で、マス向けには届いていない(上記数字からの読み取り)。
- Fomo3D(2018、古い可能性): 「最後に鍵を買った人が勝つ」タイマー式ポットゲーム。2018/8/22に勝者が10,469 ETHを獲得。block stuffing(高gas価格で他txを締め出す、約40-50 ETHのコスト)で勝利。別の攻撃者はblockフィールド由来の乱数(airdrop)を悪用 — [Hackernoon](https://hackernoon.com/the-anatomy-of-a-block-stuffing-attack-a488698732ae), [Solmaz](https://solmaz.io/2018/10/18/anatomy-block-stuffing/), [Medium(乱数脆弱性)](https://medium.com/@zhongqiangc/randomness-in-smart-contracts-is-predictable-and-vulnerable-fomo3d-part-1-4d500c628191)。
- Axie Infinity: DAUは2021年11月に約270万でピーク、2022年3月に約150万へ。2025年は5万〜10万程度の報告(情報源により差があり、「2,000-5,000」という外れ値サイトは信頼しない)。原因は「ユーザー増加を収益化する」経済モデル — [Naavik](https://naavik.co/deep-dives/axie-infinity-part-2/), [Blockworks](https://www.blockworks.com/news/axie-infinity-active-users-nft-prices-continue-to-decline-after-bridge-reopening), [BlockchainGamer](https://www.blockchaingamer.biz/amp/features/13002/most-popular-blockchain-games-2/)。
- Fantasy Top(Blast, 2024): 約34,000ユニークユーザー、約8,000 ETH取引、ローンチ後$10.6M以上のfee、一時トップ10プロトコルfee。その後Blast TGE後に指標が大きく低下 — [The Block](https://www.theblock.co/amp/post/293128/fantasy-top-and-pump-fun-break-into-top-ten-crypto-protocols-by-fees-generated), [Decrypt](https://decrypt.co/229953/ethereum-game-fantasy-top-crypto-most-profitable-apps?amp=1), [The Defiant](https://thedefiant.io/fantasy-top-mounts-a-comeback-with-tactics-v2)。現在値は未確認。
- Gods Unchained: 2026年もReckoning拡張(10/13、87枚)を出し運営継続。信頼できるDAU/MAUは見つからず(アプリトラッカーはAndroid MAU 2.7Kと表示、信頼性低) — [egamers](https://egamers.io/?p=120341), [AppGoblin](https://appgoblin.info/apps/com.immutable.godsunchained)。
- ゲーム全体: DappRadar報告で2025年のゲームdUAWは約480万(年内最低水準) — [DappRadar](https://dappradar.com/blog/gaming-hits-4-8m-duaw-lowest-of-2025-so-far)。
- FHEゲーム/デモ: Bluff and Barrel(Fhenix CoFHE、4人ブラフ+ロシアンルーレット、隠し手札・暗号化弾位置、Arbitrum Sepolia)— [HackQuest](https://hackquest.io/en/projects/Bluff-and-Barrel)。Pokerr(Inco、ETH Denver 2024上位3、Base、古い可能性)— [Inco](https://www.inco.org/blog/eth-denver-recap)。EncrypMarket(Fhenix、暗号化された賭け)— [ETHGlobal](https://ethglobal.com/showcase/encrypmarket-av61h)。
- Zama側: Season 5は「Confidential Gaming」トラックで報酬5,000 cUSDT、Season 8の優勝解に暗号化Wordle、Developer Programページにprivate multiplayer number guessingゲームが掲載 — [Season 3勝者](https://www.zama.org/post/announcing-the-developer-program-mainnet-season-3-winners), [Season 8](https://zama.ai/post/zama-bounty-program-season-8), [Developer Program](https://zama.ai/programs/developer-program)。Season 3勝者9件はゲームなし(DeFi/決済/配布系)。
- Fhenix自身が「FHEは遅延があるため、時間制約の緩い戦略/カジノ系ゲームに向く」と主張(2023、古い可能性)— [Fhenix blog](https://www.fhenix.io/blog/trustless-gaming-not-all-is-fair-play)。

### Inferences
- FHEゲームは現状ハッカソン/デモ段階で、ユーザー数・リテンションの実データはない。「商業的に成功したFHEゲーム」は不在と見てよい(ただし網羅検索はしていない)。
- 人気オンチェーンゲームの失敗は「隠し情報の技術」ではなく「トークン経済依存」。Fun先行・短時間・低摩擦が必要で、FHEは体験の差別化要素に留めるべき。
- Fomo3Dの教訓: 乱数と順序(block stuffing/MEV)の公平性は、ゲーム設計上の実害になる。FHE乱数/秘密選択は同種の攻撃面を減らせる。

### Gaps
- Dark Forestの累計/現在ユーザー、0xPARCの他ゲーム(zk poker/battleship等)の数値。今回は取得できず。
- Fantasy Top/Gods Unchainedの最新の信頼できるユーザー数。Stake/Polymarket系ミニゲーム、Pudgy/Pokemon系の数値は未調査。
- Inco/Sunscreen/Mind Networkのゲーム事例は未調査(Fhenix/Incoのhackathon事例のみ)。
- Zama Season 4/5のゲーム勝者の具体名は未確認。

## Q2. FHE技術制約(HCU、レイテンシ、復号フロー、乱数、UXパターン)

### Takeaway
演算コストはHCUで計上され、select/randは安く(select約55k、rand約23-25k)、add/比較/mulは型が大きくなるほど高い。復号は非同期(makePubliclyDecryptable→relayer→checkSignatures)で、1ラウンドは「チェーン確定+relayer往復」分の待ちが必須。具体的な往復秒数の公式値は見つからなかった。

### Cited Findings
- HCU上限(devnetページ): 1 tx あたり20,000,000、depth上限5,000,000、超過でrevert。v0.12リリースノートでHCULimitコントラクトがblock/tx/depth上限を設定可能に。per-blockは別ページで10,000,000との記載(旧名FHEGas、古い可能性) — [HCU docs](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu.md), [Changelog](https://docs.zama.org/protocol/changelog)。現行mainnet値は要確認。
- HCUコスト(scalar/非scalar): euint8 add 84k/88k、lt 52k/59k、eq 55k、select 55k、randEuintX 23k。euint64 add 133k/162k、lt 118k/146k、select 55k、mul 365k/596k、rand 24k。euint128 mul 696k/1.69M、select 57k、rand 25k — [HCU docs](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu.md)。
- 乱数: `FHE.randEbool()`、`FHE.randEuintN()`(8〜256bit)。上限指定版は2の冪が必須。tx内でのみ実行(eth_call不可)、暗号論的PRNGで暗号文のまま保持され予測不能 — [Random docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)。
- 公開復号フロー: (1)コントラクトが`FHE.makePubliclyDecryptable`(永続・全員に公開、ACL必須) (2)クライアントがSDKの`publicDecrypt`でrelayer/KMSから平文+復号証明取得 (3)平文+証明をコントラクトに送り`FHE.checkSignatures`で検証。(1)のtx確定後でないとrelayerは要求できない。replay防止を推奨。タイミング数値の記載なし — [Oracle/decryption docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/oracle)。
- 計算ベンチ(TFHE-rs v1.7、8xH100 1ノード、64bit): add 21.7ms、select 8.5ms、比較21.9ms、PBS 3.94ms。ERC-7984転送で1,040 TPS・51.5ms/件。"on one GPU node, not end to end settlement"と明記。決済はチェーンのコンセンサス/ブロック時間が律速 — [Zama blog](https://www.zama.org/post/1000-tps-confidential-transfers-gpu-zama-protocol)。
- Zamaはcallデータ(FHE input proof)増大がAAバッチの制約になるとコミュニティで議論 — [Zama community](https://community.zama.org/t/porto-aa-batch-limits-with-erc-7984-measuring-userop-calldata-growth-from-fhe-input-proofs/4308)。

### Inferences
- ミニマムなラウンド(2人の選択比較+勝敗select)は、euint8の比較・select数回で数十万HCU程度。20M/tx上限内に十分収まる(コスト表からの推定、実測ではない)。多人数(N人の集計・少数派判定)はN倍で、euint8の加算とselect中心に設計すれば安価。mul/128bitは避ける。
- 1ラウンドの体感遅延は「入力tx確定 + 公開復号要求tx確定 + relayer応答 + 検証tx確定」の最低3〜4ステップ。mainnetのブロック時間次第で数十秒〜になりうる(推定)。UXはタイマー、非同期ラウンド、リビール演出、複数ラウンド並列で隠すべき。
- Sepolia vs mainnetの違いは未確認(下記Gaps)。

### Gaps
- Sepolia/mainnetでの公開復号の実測往復時間、現行HCU per-block/per-tx上限(mainnet)、gas価格での実コスト。公式ドキュメントに具体値なし。
- Fhenix/Incoの性能数値比較は未調査。2024年以前のFHE性能(秒単位のレイテンシ等)は古く、今回は引用していない。

## Q3. FHEが本当に必要なパターンと不要なパターン

### Takeaway
FHEが必須なのは「複数人の秘密入力をコントラクトが秘密のまま計算し、結果だけを決済に使う」場合と、秘匿残高(ERC-7984)。1人の乱数や2人のcommit-revealで足りる場合、FHEは装飾になりやすい。

### Cited Findings
- 暗号化状態のまま比較/選択/加算/乱数生成が可能で、必要な値のみ公開復号できる(上記Q2のdocs)。
- ERC-7984はOpenZeppelin、Zama、Incoらによる秘匿トークン標準。cUSDC/cUSDT等のwrapperがmainnet/testnetで稼働 — [Zama Protocol Update](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps)。
- 乱数がブロック由来だと予測/操作される(Fomo3D)— [Medium](https://medium.com/@zhongqiangc/randomness-in-smart-contracts-is-predictable-and-vulnerable-fomo3d-part-1-4d500c628191)。

### Inferences
(以下はCited Findingsと一般的な暗号設計知識に基づく筆者の判断)
- FHE必須: (a)同時の秘密選択+オンチェーン精算(最後に誰が少数派か、はサーバ無しで検証可能)、(b)他者に見えない賭け額/ステーク、(c)封印入札、(d)バトル時のみ公開される隠しステータス、(e)秘匿残高(ERC-7984)。
- FHE不要/代替可: 2人のRPSはcommit-revealで十分(ただし後出し・不参加による放棄が問題→タイムアウト設計で対応可)。1人用の運ゲーはVRF/オフチェーン乱数で足りる。UI上の「隠し」だけなら通常サーバで足りるが、サーバ信頼が必要。
- FHEの本質的な付加価値は「N人の秘密入力を集計する際に、誰も途中結果を見られず、開示を強制されない」点(commit-revealはreveal放棄で結果を妨害できる)。Minority系(少数派勝ち)はまさにこの集計型。

### Gaps
- commit-revealとFHEのコスト/UX定量比較は一次資料なし(未実施)。

## Q4. エコシステム事実(mainnet、チェーン、助成、トークン標準、ウォレット)

### Takeaway
Zama ProtocolはEthereum mainnetで2025年末に稼働済みで、ERC-7984 wrapperも利用可能。開発者向けプログラムが継続しており、ゲームは過去にトラックあり。

### Cited Findings
- Zama Protocol mainnet: Ethereum上で2025/12/30-31にローンチ(情報源により1日差)、初の秘匿cUSDT転送。Bron(給与支払)、GSR(OTC)の実利用。2026/11/9にZama発のRaycashがmainnetでprivate beta — [Zama Protocol Update](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps), [Bron](https://www.zama.org/post/the-first-confidential-payroll-on-ethereum-mainnet), [The Block](https://theblock.co/news/defi/2026-11-09-zama-spin-off-raycash-launches-confidential-stablecoin-payments-private-yield-ethereum-435909)。これらはベンダー発信の主張。
- Developer Program: mainnet Season 3(Builder/Bounty/Special、計12,500 cUSDT、勝者はDeFi/決済/ツール系)、Season 5は「Confidential Gaming」トラック(5,000 cUSDT)の記載、Season 8/9も開催(Season 9: privacy DCA bot) — [Season 3勝者](https://www.zama.org/post/announcing-the-developer-program-mainnet-season-3-winners), [Developer Program](https://zama.ai/programs/developer-program), [bounty repo](https://github.com/zama-ai/bounty-program/)。Season番号の対応(mainnet seasonとbounty seasonの違い)は混在、要確認。
- SDK刷新とdelegated decryptionが発表済み。ポートフォリオアプリでshield/unshield/transfer可(mainnet+Sepolia)— [Zama Protocol Update](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps)。
- スキル情報: Zama公式のOpenZeppelin confidential contractsとrelayer API keyが必要(別途zama-fhevm skillで確認可)。

### Inferences
- 対応チェーンはEthereum mainnet+Sepolia中心。ゲームのような高頻度txはEthereum mainnetのgas/ブロック時間が障壁になりうる(推定)。

### Gaps
- Zamaの対応チェーン拡大(L2等)、現行の助成金額/締切、埋め込みウォレット+gas sponsorshipの公式サポート状況は未確認。

## Q5. FHEが必須になるゲームコンセプト(needs FHE / mass-appeal、各1-5、筆者の主観的評価・未検証)

### Takeaway
最も有望なのは「N人の同時秘密選択を集計して少数派/多数派を精算する」型。1ラウンド数十秒の非同期カジュアルとして設計できる。

### Cited Findings
- 実在例の参考: 暗号化Wordle、private number guessing、Bluff and Barrel、Pokerr(Q1参照)。以下のコンセプトは既存例に基づく「plausible」案で、数値評価は筆者の判断。

### Inferences
1. Minority Rush型(N人が選択肢を秘密提出、少数派が勝ち賞金): FHE 5 / 訴求 4。集計をチェーン内で秘密のまま行える。
2. 秘匿ステークのRPS/拡張じゃんけんトーナメント: FHE 3 / 訴求 4。2人ならcommit-revealで代替可、賭け額秘匿でFHE度が上がる。
3. 封印入札のNFT/アイテムオークション: FHE 5 / 訴求 2。
4. 秘匿ステータスのカードバトル(開戦時のみ公開): FHE 4 / 訴求 4。
5. オンチェーンPoker/Bluff: FHE 5 / 訴求 3(遅延が体験を損なう)。
6. 人狼/Mafiaの隠し役職: FHE 4 / 訴求 3。
7. 暗号化Wordle/数当て(ホストが答えを知らない): FHE 3 / 訴求 4。
8. 秘匿予測ゲーム(他人の予測が見えない群衆予測): FHE 4 / 訴求 3。
9. 隠し宝探し/地雷原(Minesweeper型、座標秘匿): FHE 3 / 訴求 3(ZKでも可)。
10. Fog-of-war戦略(Dark Forest後継): FHE 3 / 訴求 2(ZKとの比較が必要)。
11. 秘匿ガチャ/ルート箱(結果が購入前後で操作不能): FHE 2 / 訴求 4(VRFで代替可)。
12. ERC-7984による秘匿残高ゲーム内通貨/ランキング(額を隠す): FHE 4 / 訴求 3。

### Gaps
- 上記スコアの検証(ユーザーテスト、競合実績)は未実施。

