# 乱数・ランダム生成を核にしたゲームと公平性の信頼問題（FHE 活用視点）

調査日: 2026-11-14。注記: 検索結果は二次情報（ゲームメディア・解説記事）が中心。一次情報で確認できなかった点は「未検証」と明記。URL のない記述は「一般知識・未検証」ラベル付き。

## 1. 乱数が核のゲーム／フォーマットのカタログ

### Takeaway
乱数がフックになるゲームは「確率ガチャ」「ドロップ」「ダイス」「ローグライクのシード」「デイリー共通シード」「オンチェーン宝くじ」に大別できる。共通点は「結果が事前に分からず、観客・本人が結果の開示を待つ瞬間」が快感の中心であること。

### Cited Findings
- ガチャは日本では通常の有料ランダム抽選は合法で、「コンプガチャ」だけが景品表示法上の違法な景品類（2012年）とされた。ガチャ自体（ランダム課金）は引き続き許容 — [GamesBeat](https://gamesbeat.com/complete-gacha-illegal/)
- Genshin Impact: 5★キャラ基礎排出率 0.6%（ピティ込み平均約1.6%）、ソフトピティ75〜、ハードピティ90、限定バナーは 50/50 → 外すと次は確定の「保証」。ただし数値はコミュニティ検証・攻略記事由来で、公式のピティ表ではない — [Genshin Wiki](https://genshin-impact.fandom.com/wiki/Wish), [rpgsite](https://rpgsite.net/feature/10312-genshin-impact-wish-system-gacha-and-banners-explained), [KQM](https://library.keqingmains.com/evidence/general-mechanics/gacha)
- Fate/Grand Order: 最高レアリティ 1.0%、ソフトピティなし、330連で確定（スパーク）、2022年初に導入（第三者比較表） — [GuruGamer比較/ピティ解説](https://gurugamer.com/pc-console/gacha-pity-systems-explained-the-real-odds-behind-90-pulls-27402)、[Hakaru解説](https://hakaru.io/guides/gacha-probability-calculator-guide)（個別数値は未検証、FGO 330連の根拠は上記検索結果の記事）
- Balatro: シード入力でラン再現可能。RNG をショップ・カード等で別ストリーム化しシードの一貫性を保つとの説明は「ユーザー投稿」で公式見解ではない。シードランは収集進捗にカウントされない — [Insider Gaming](https://insider-gaming.com/best-balatro-seeds/), [Steam Community](https://steamcommunity.com/app/2379780/discussions/0/7410182519541238974)
- Balatro のレビューは「単純なメカニクスなのに各ランが新鮮」と評価 — [GameSpot](https://GameSpot.com/reviews/balatro-review-one-more-blind/1900-6418192/)
- Zama FHEVM の乱数ダイスの例（コミュニティ）: ランダム値を `FHE.rem` で範囲に落とす（random % 6 + 1）— [Labz docs（コミュニティ）](https://labzee.gitbook.io/labz-docs/advanced/dice-game)

### Inferences
- ガチャ(確率課金)・ドロップ・カードパック・ダイスは「リアルタイムの開示演出」が価値。ローグライク/デイリーシードは「公平な共通条件での比較」が価値。FHE 側の機能(結果が秘匿され後で開示)は前者の「開示の瞬間」と後者の「事前に誰も知らない」に自然に合致。
- Puzzle & Dragons、Uma Musume、アイドルマスター シンデレラガールズ、Slay the Spire、Wordle、パチンコ等は今回の検索では個別の一次・二次ソースを取得できていない。

### Gaps
- Puzzle & Dragons / Uma Musume / デレステ / Slay the Spire Daily Climb / Wordle / パチンコ・パチスロの具体的な仕様・規制は未検証（検索で該当結果なし。ウマ娘は検索自体が空振り）。
- 公式のドロップ率表は個別ゲームの公式ページで要確認。

## 2. 心理学：なぜ乱数報酬が中毒的になり、害に転じるか

### Takeaway
変動比率強化・希少報酬時の高い覚醒・ニアミス・ピティ（天井）の組み合わせが「次こそ」を生む。ルートボックス支出と問題ギャンブル指標の関連は複数研究で報告されているが、ガチャ固有の査読研究は検索結果では薄い。

### Cited Findings
- 変動比率スケジュールは高く持続的な反応率と関連し、次の試行が当たりかもしれないとやめにくくなる — [Simply Psychology](https://www.simplypsychology.com/articles/gacha-games-psychology)（二次解説）
- ルートボックス報酬研究: 稀少アイテムほど報酬後の休止が長く皮膚電気反応（覚醒）が大きい（Journal of Gambling Studies の研究を引用した二次記事）— [PFFC](https://pffc-online.com/media/pages/the_allure_of_the_draw__gacha_mechanics_game_monetization_and_its_psychology.html)
- ルートボックス支出と問題ギャンブル重症度の関連（Zendle & Cairns 2018 成人、Zendle, Meyer & Over 2019 青年で一層強い関連、との二次要約）。最高支出層で最も強い — [GuruGamer](https://gurugamer.com/reviews/same-machine-different-skin-what-gacha-pulls-and-slot-reels-have-in-common-27099)
- 収益は少数の高額課金者に集中（二次解説）— 同上
- ピティはハード天井で総コストに上限を与え不確実性の見せ方を変える／「公平に感じさせつつ確実に搾取する」という論評（意見記事）。リテンション目的も — 同上、[GuruGamer ピティ解説](https://gurugamer.com/pc-console/gacha-pity-systems-explained-the-real-odds-behind-90-pulls-27402)
- 日本の20代ゲーマーの約1割がゲーム課金で金銭的トラブルに（調査記事、方法論は未検証）— [Spilled.gg](https://spilled.gg/survey-japanese-gamers-20s-financial-trouble-spending)
- ニアミスは一部のギャンブル文脈で覚醒・継続意欲を高めるが効果の大きさは様々 — [GuruGamer](https://gurugamer.com/reviews/same-machine-different-skin-what-gacha-pulls-and-slot-reels-have-in-common-27099)

### Inferences
- 「秘匿乱数」は心理的フック自体（変動比率・開示演出）は変えない。FHE で変わるのは信頼の層であり、中毒性を下げるものではない。むしろ「公平だから安心して課金しすぎる」リスクがある。倫理的には課金上限・ピティ開示と併用すべき。

### Gaps
- ガチャ特有の査読研究・日本語の学術研究は今回未取得。

## 3. 規制（日本・韓国・EU・ブラジル他、2025–2026）

### Takeaway
日本は「コンプガチャ禁止」＋「虚偽表示に景表法（優良誤認）」＋業界自主規制。韓国は2024年3月から確率開示を法定化し罰則強化中。EU はデジタル公正法（DFA）提案が2026年11月に提示。ブラジルは2026年3月から未成年向けルートボックス禁止。

### Cited Findings
- 日本: 景表法第5条は実際より著しく優良と示す表示（優良誤認）を禁止。『FFBE幻影戦争』のガチャ5件が措置命令を受けスクエニが公表 — [gamebiz](https://gamebiz.jp/news/299384)、条文抜粋 [東京都資料](https://www.metro.tokyo.lg.jp/documents/d/tosei/20260323_11_01)
- 日本の確率表示は主に業界の自主規制ガイドラインに依拠（学術論文）— [DiGRA Japan 論文](https://dl.digra.org/index.php/dl/article/view/2749)（本文は取得不可、書誌情報のみ確認: Xiong ら, 2026-03-02, 東アジア比較）
- 令和7年度の優良誤認は措置命令0件・課徴金1件・指導1件（2026年6月公表資料。ゲームに限らない全体件数の可能性、要確認）— [消費者庁 PDF](https://www.caa.go.jp/notice/assets/representation_260626_02.pdf)
- 2023年改正景表法は2024年10月1日施行で確約手続導入 — [all-senmonka](https://www.all-senmonka.jp/moneyizm/?p=308696)
- 2025年1月31日に確率アイテム紛争の特別訴訟ルールが追加という記述は非権威的な法律ブログ1件のみ（未検証）— [Monolith Law](https://monolith.law/en/?p=59040)
- 韓国: 確率型アイテム開示は2024年3月から法定化。2025年8月1日から最大3倍の懲罰的損害賠償と立証責任転換。2025年12月23日発議の改正案は売上3%または最大10億ウォンの課徴金。Webzen は是正命令と1億5800万ウォンの課徴金 — [Inven Global](https://www.invenglobal.com/articles/20244/loot-box-crackdown-south-korea-eyes-revenue-penalties-for-probability-disclosure-breaches), [Digital Today](https://www.digitaltoday.co.kr/jp/view/37626/ftc-fines-webzen-over-probability-items), [Asiae](https://www.asiae.co.kr/en/article/2024010217184301389)
- ブラジル: Lei 15.211/25 が18歳未満がアクセスできるゲームでの有料ランダム報酬を禁止、2026年3月施行 — [PC Gamer](https://www.pcgamer.com/gaming-industry/brazils-president-has-signed-a-ban-on-selling-loot-boxes-to-minors-as-part-of-a-larger-online-child-safety-law), [wccftech](https://wccftech.com/brazil-president-signs-law-to-ban-loot-boxes/)
- ベルギーは2018年に禁止。オランダの扱いは情報源間で矛盾（違法とする記事と、動議にとどまり EA への罰則は覆ったとする記事）— [siege.gg](https://siege.gg/news/several-eu-countries-have-introduced-stricter-regulations-on-loot-boxes-in-games-in-2025), [programminginsider](https://programminginsider.com/loot-boxes-regulation-and-where-the-line-sits-in-2026/)
- EU: 欧州委員会が2026年11月10日（別記事では11日）にデジタル公正法案を提示、仮想通貨の実額表示、未成年向けにダーク・パターンや賭博的ルートボックス禁止、有償仮想通貨の初期無効化（保護者承認）。リーク段階の記事は最終案と異なる可能性。成人向け確率開示は報道ベース — [Gaming.net](https://www.gaming.net/european-commission-proposes-loot-box-and-virtual-currency-rules/), [Lovguiden](https://www.lovguiden.dk/en/det-offentlige/europa-kommissionen-press-corner/2026-11-11-eu-digital-fairness-act-dark-pattern-ban-and-fines-of-up-to-6-of-turnover), [PocketGamer.biz](https://www.pocketgamer.biz/leaked-eu-proposal-targets-loot-boxes-and-addictive-game-design)
- 欧州で有料ルートボックスに最低 PEGI 16 という報道 — [ScreenHub](https://www.screenhub.com.au/news/games/loot-boxes-pegi-16-age-rating-2695980/)（未検証）

### Inferences
- 規制の中心は「確率の真実表示」と「未成年保護」。FHE 乱数は前者（確率が表示どおりか）に直接効くが、後者（課金依存）には効かない。ガチャ課金型で FHE を売るより、「賭け金・課金のない」または「トークン/ポイントで遊ぶ」形が規制リスクが低い（法的助言ではない。賭博該当性は各法域で別途要確認）。

### Gaps
- 日本の 2025–2026 年のガチャ個別措置命令・消費者相談件数（PIO-NET）は未取得。コンプガチャ後の JOGA ガイドラインの現行版は未確認。
- 韓国・EU の最終法文は一次情報未確認。

## 4. 公平性・信頼問題と Provably Fair の限界

### Takeaway
「確率の誤表示」「運営による操作疑念」はどの市場でも繰り返し起きる。オンチェーンでは VRF 等で乱数値の予測不能性は確保できるが、順序・タイミング・包含（MEV/バリデータ）攻撃は別途ゲーム設計で防ぐ必要がある。

### Cited Findings
- 誤表示は規制対象（上記 FFBE 幻影戦争、Webzen）。
- 乱数サービスの学術論文: 攻撃者が複数リクエストを観察し有利な乱数値を選ぶフロントランの可能性を指摘。リクエスト Tx が必要という設計上の制約 — [IACR ePrint 2024/957](https://eprint.iacr.org/2024/957.pdf)
- 同一ブロック内でプレイヤーが参加し結果が決まる設計は根本的に危険という実務者の指摘 — [Mueller (Medium)](https://muellerberndt.medium.com/building-a-secure-nft-gaming-experience-a-herdsmans-diary-1-91aab11139dc)
- VRF は未来ブロックを待つため遅延（約12秒以上）、オラクル網の稼働に依存するとの主張はベンダー系ブログで未検証 — [Chainscore](https://www.chainscorelabs.com/blog/smart-contract-auditing-and-best-practices/oracle-and-randomness-security/why-vrf-is-not-a-silver-bullet-for-on-chain-gaming)
- 推奨される緩和: アプリ層の commit-reveal、確認数の確保 — [Speedrun Ethereum](https://speedrunethereum.com/guides/chainlink-vrf-solidity-games)
- drand/tlock: League of Entropy の閾値 BLS ビーコンに基づくタイムロック暗号。依存は IBE・閾値 BLS・ビーコンの正直性。Rust クレートは「未監査」と明記 — [tlock Rust docs](https://docs.rs/crate/tlock/0.0.9), [tlock-bls 論文](https://appliedcryptography.page/papers/tlock-bls.pdf), [drand blog](https://docs.drand.love/blog/multi-frequency-support-and-timelock-encryption-are-coming-to-drand)
- Chainlink VRF 公式のセキュリティ考慮事項ページは取得失敗（404）。公式記述は未検証。

### Inferences
- 「結果がプレイヤーの行動前に見えてしまう」問題（VRF 結果が公開後、選択前に観測可能）は、FHE で結果を暗号化したままゲームロジックに入れれば解消できる。
- FHE でも「リクエスト順序・Tx 包含の検閲」「復号タイミングの選択（結果を見て復号しないという戦略的放棄）」は残る可能性が高い（設計上の推論で、Zama 固有の検証はしていない）。

### Gaps
- Chainlink VRF 公式のセキュリティ記述、drand の現行運用状況、オンチェーンゲームの具体的ポストモーテム（例: 乱数悪用事件）は未取得。

## 5. FHE（Zama FHEVM）の乱数と「信頼のブランド化」

### Takeaway
FHEVM は `FHE.randEbool()` と `FHE.randEuint8〜256()` を提供し、値は暗号化されたまま扱える。ただし上限指定は2のべき乗のみ、Tx 内でのみ生成可能。「誰も見えない・操作できない」を売りにできるが、公開鍵・KMS・復号の信頼前提は残る。

### Cited Findings
- 関数: `FHE.randEbool()`, `FHE.randEuint8/16/32/64/128/256()`。上限付き版は上限が2のべき乗で範囲は [0, upperBound-1]（例 `FHE.randEuint8(32)`）。Tx 内でのみ実行可（PRNG 状態をオンチェーン更新するため、eth_call 不可）。CSPRNG で生成、値は暗号化され無権限者は参照・予測不可。ガスを消費 — [Zama docs: random](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)
- 旧版(0.3-2)のドキュメントは「PRNG のシードと状態が公開で平文生成」という警告を載せていた。現行版では記述が異なる — [Zama 0.3-2](https://docs.zama.ai/fhevm/0.3-2/how-to/random)（検索結果の要約に基づく。現行との差の詳細は未検証）
- 非2べき乗の範囲は rem で落とす例があるが、モジュロバイアスの扱いは公式ページに記載なし（コミュニティ例のみ）。

### Inferences
- ブランド案: 「運営も見えない（Sealed Dice）」「引く前から結果が決まっているが誰にも見えない」。Genshin 型の「確率の本当さ」への不信、規制での確率表示義務に対し、コード・暗号で検証可能という訴求は筋が良い。
- FHE で直せない: 排出テーブルそのもの（確率設定）の誤表示、ピティ設計の悪意、課金誘導、未成年保護、運営がコントラクトを差し替える権限、復号・KMS の信頼前提。「確率が表示どおりであること」はコントラクトのオープンソース化と不変性が必要で、乱数の秘匿だけでは不十分。

### Gaps
- Zama の閾値 KMS / ゲートウェイの現行信頼モデルとコスト（HCU）は今回未確認。zama-fhevm スキルで補完推奨。

## 6. 代表例 8〜12件（メカニクス / フック / 信頼弱点 / FHE 再ブランド可能性 1-5）

注: ゲーム固有の数値は上記の二次ソース。スコアは当方の主観評価（推測）。

| # | 例 | メカニクス | フック | 信頼の弱点 | FHE 点 | 理由 |
|---|---|---|---|---|---|---|
| 1 | Genshin 型ピティ付きガチャ | 0.6%基礎、ソフト75/ハード90、50/50 | 保証までの物語、確定と運の混合 | 公式ピティ表が不明瞭との指摘、運営が率を変えられる疑い | 3 | 乱数は検証可能にできるがテーブル・課金設計問題は残る |
| 2 | FGO 型（1%、330連スパーク） | 低率＋天井 | 高額でも確定の安心 | 率の誤表示は規制対象 | 3 | 同上、課金性が規制リスク |
| 3 | 日本型コンプガチャ（禁止済） | セット収集のため繰り返し抽選 | 収集欲 | 違法 | 1 | 禁止済み領域 |
| 4 | カードパック開封 | ランダム封入 | 開封演出・トレード | 封入率の不透明 | 4 | 封入率検証を売りにでき、トークン/NFT 親和的 |
| 5 | Balatro / ローグライクのシード | シード固定ラン、別 RNG ストリーム | 毎回違う＋共有可能な再現性 | 低（ローカル） | 2 | 信頼問題が小さく、FHE の必要性が薄い |
| 6 | デイリー共通シード（Wordle 型） | 全員同じ問題 | 共有・比較 | 運営が答えを知っている | 4 | 答えを暗号化し運営も知らない、は明確な売り（一般知識・未検証） |
| 7 | オンチェーンダイス/宝くじ | VRF 等で当せん決定 | 賞金・透明性 | リクエスト順序・ MEV・VRF 依存 | 4 | 結果が事前に見えない設計が可能。ただし賭博規制に注意 |
| 8 | 予測市場系 | 結果は外部事象 | 情報優位 | オラクル | 2 | 乱数が核でない |
| 9 | ダイス/ボードゲーム | 物理/アプリ乱数 | 運の演出 | 低い | 3 | 対戦型でオンラインの信頼が重要な場合のみ |
| 10 | クリティカル/確率演出（RPG） | 命中・会心 | ハラハラ | 「当たらない」不信 | 4 | 秘匿対戦で相手も見えない判定は筋が良い |
| 11 | ルーレット/スロットのリール演出 | 乱数先決・演出後付け | 開示のタメ | 演出と結果の乖離疑念 | 3 | 「結果は演出前に確定」を証明可 |
| 12 | パチンコ/パチスロ | 内部抽選 | ニアミス（リーチ） | 設定の秘匿 | 1 | 日本の風営法領域、本調査では未検証 |

## 7. 秘密選択マイノリティゲームに載せられる乱数メカニクス

### Takeaway
乱数を「結果の質」ではなく「同点処理・イベント修飾・育成の揺らぎ」に限定すると、チープに見せずに FHE の秘匿性を活かせる。

### Inferences（提案、全て当方の設計案・未検証）
- 同点（タイブレーク）: 少数派が複数並ぶ場合の勝者を `FHE.randEbool` 由来で決定。運営も操作できないと明示でき、自然な採用点。
- ランダムイベント/モディファイア: ラウンド開始時に暗号化された修飾（「今回は多数派が勝つ」等）を決め、結果開示まで誰も見えない。選択に影響させると不公平になるため、修飾は選択後に開示するか、選択前に確率分布だけ開示する。
- ランダムな育成: 勝利時のキャラ成長値を暗号乱数で決定。ガチャ的課金とは切り離し、ゲーム内成果のみで使えば規制面でも安全寄り（賭博該当性は別途要確認）。
- ニアミス演出は害の面もあるため避ける（上記心理学節）。ピティ的な保証（連敗時の救済）は公平感を出せる。
- 注意: 乱数が選択結果を支配しすぎると戦略性が薄れる。1〜2要素に絞り、確率テーブルをコントラクトで公開する。
- 注意: `randEuint` の上限が2のべき乗のみ、Tx 内生成、ガス（HCU）コストが設計制約。

### Gaps
- 乱数の結果を選択後に復号するフローで、復号を拒否する戦略的放棄への対策（タイムアウトで公開復号等）は Zama の公開復号機能の確認が必要で未検証。

## 検証ステータス要約
- 実コード/公式確認: Zama 乱数ドキュメント（取得済）、GamesBeat（コンプガチャ）
- 二次情報: 規制ニュース、心理学解説、ガチャ率（コミュニティ）
- 未取得・未検証: 消費者庁一次資料の詳細、Chainlink VRF 公式、DiGRA 論文本文、Uma Musume/デレステ/PAD/Slay the Spire/Wordle/パチンコの個別情報
