# 同時秘密選択（Simultaneous Secret Choice）ゲームの調査とFHEリブランド可能性

調査日: 2026-11-14。注記: 引用URLの一部はWikipediaミラーや二次情報。ファンwiki(kaiji.fandom / pixiv百科)は取得不可(402/403)のため、詳細ルールは「未確認」と明記。「推論」欄は調査者の判断で、出典なしの一般知識は「(一般知識・未検証)」と記す。

## Q1. 同時秘密選択を核とするゲーム/フォーマットのカタログ（10〜15本、ルール・人数・時間・魅力・リプレイ要因・弱点・FHEスコア）

### Takeaway
核は「全員が同時に隠した選択をし、一斉公開する」構造で、(a)循環的な読み合い(RPS系/Yomi)、(b)多数派/少数派の外し合い(Minority Game, 少数決)、(c)他者の思考階層の推測(2/3 beauty contest)、(d)資源配分(Blotto)、(e)交渉+同時命令(Diplomacy)に分かれる。弱点は「信頼できる審判/封筒」「非同期だと最後に動く者が有利」「共謀」「解かれた戦略」に集約される。

### Cited Findings
各ゲームの事実（ルール・実験結果）:

1. **Rock-Paper-Scissors-minus-one（Squid Game 2）** — 最終ラウンド前に1手を取り下げる変形。同種2手(例: グー+グー)は強く劣位、グー+パー vs グー+チョキにはNash均衡が無いという数理分析 — [The Post PH](https://thepost.ph/arts-culture/streaming/squid-game-2-rock-paper-scissors/)
2. **Kaiji 限定ジャンケン** — カード式ギャンブルで、カイジが最初に参加する賭け。参加者に軍資金(実態は貸付)が渡され、4時間の航海中に資金を保持し続けると140%返済が必要でゲームを早く終わらせる動機になる。星の具体的ルールは本調査で未確認 — [Kaiji Wiki](https://kaiji.fandom.com/wiki/Restricted_Rock_Paper_Scissors?oldid=7305)(検索スニペット経由), [ファミ通](https://www.famitsu.com/article/202507/47988)。2025年の一番くじでは限定ジャンケンのプレイセット（最大4人、カード48枚、星12個、ペリカ10枚）が商品化 — 同ファミ通記事(検索スニペット)。3つの星・3種カードという点は[エピソード要約](https://thetvdb.com/series/kaiji/episodes/357044)にも言及あり
3. **ライアーゲーム 少数決（2回戦）** — 22名が命題に対して各自投票し、少数派に回った者が勝者。全員に1億円配布、総額22億円が賞金（検索結果の紹介文）— [pixiv百科事典 LiarGame](https://dic.pixiv.net/a/LiarGame)(スニペット), [Liar Game Wiki](https://liarsgame.fandom.com/wiki/Liar_Game_(Manga))。TVドラマ第3話紹介ではチーム結成で「誰かが必ず残る必勝法」が使われる — [ciatr](https://ciatr.jp/topics/323364)。詳細な脱落条件は未確認
4. **Minority Game / El Farol** — Challet & Zhang(1997)が提案。奇数人のプレイヤーが各ターン独立に二択を選び、少数側が勝つ。対称な決定論的戦略は均衡にならず、混合戦略(50%)のみが対称Nash均衡。El Farolは1994年Arthurの問題で100人中60席閾値、MGは50%閾値の簡略版 — [Wikipedia El Farol](https://en.wikipedia.org/wiki/El_Farol_Bar_problem), [arXiv adap-org/9708006](https://ar5iv.labs.arxiv.org/html/adap-org/9708006), [ar5iv cond-mat/9811162](https://ar5iv.labs.arxiv.org/html/cond-mat/9811162)
5. **Guess 2/3 of the average（Keynesian beauty contest）** — 0〜100を同時に選び、平均の2/3に最も近い人が勝ち。唯一の純粋Nash均衡は0だが、level-kモデルでは多くの人がlevel 0〜3(約50→33→22…)。Nagel(1995)の初回平均は約36。2005年Politiken(19,196人)の平均は33で、33.3を選ぶ人が多数。繰り返すと0に収束し、勝者の模倣が収束を速める — [Wikipedia](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average)。Thaler/FTコンテスト(1997)の目標値12.61(二次情報) — [ChessBase](https://en.chessbase.com/post/6000-che-players-took-part-in-our-beauty-contest/6)。Alain Ledouxが1981年に仏誌Jeux et Stratégieでタイブレークに使用 — [Wikipedia](https://www.Wikipedia.org/wiki/Guess_2/3_of_the_average)
6. **Alice in Borderland「King of Diamonds」(数当て)** — 数選択ゲームで他者の選択を推論させ、GAME OVERごとに新ルールが追加される — [Artha Vijnana解説](https://gipe.ac.in/the-king-of-diamonds-a-dissected-gameplay-of-balance-scales/)(平均系ゲームとの対応は要確認)
7. **Colonel Blotto** — Borelが1921年に提案、Gross & Wagner(1950)が命名。2人が固定の兵力を複数戦場に同時配分し、多く配分した戦場を獲得、勝利戦場数が利得。最適戦略は配分のランダム化が必要で、3戦場・対称予算の場合をBorelが解いた(1938年Borel-Villeの"disk"解) — [Wikipedia Blotto game](https://en.wikipedia.org/wiki/Blotto_game), [arXiv 1205.5788](https://arxiv.org/pdf/1205.5788)
8. **Diplomacy** — 交渉フェイズの後、各ユニットへの秘密命令を書き、全員で同時に公開・解決。サイコロ等のランダム要素は無し。命令は書いたとおり拘束される — [Wizards版ルール](https://media.wizards.com/2015/rules/diplomacy_rules.pdf), [Official Game Rules](https://officialgamerules.org/game-rules/diplomacy/)
9. **Libertalia** — 毎ターン手札(9枚)からキャラ1枚を秘密に選び同時公開、ランク順に昼(低位先)/夕(高位先)/夜(同時)の効果を解決。全員同じ手札で始まるため被りが頻発 — [Opinionated Gamers Dale Yu](https://opinionatedgamers.com/2012/08/06/dale-yu-review-of-libertalia/), [Board Game Family](https://www.theboardgamefamily.com/2022/07/libertalia-winds-of-galecrest-board-game-review/)
10. **7 Wonders** — 手札をドラフトで回し、全員が選んだ後に同時にアクション解決(同時選択ゲームの「穏やか版」) — [Dized 7 Wonders](https://rules.dized.com/7-wonders/rule/phase-2-action/phase-2-overview), [Spielbound タグ](https://www.spielbound.org/game-tags/simultaneous-action-selection?page=5)
11. **Yomi (David Sirlin)** — 格闘ゲームの読み合いをカード化した2人用(30分前後、10歳〜、10キャラデッキ)。攻撃・投げ・ダッジ・ブロックの三すくみ構造を同時選択（ダッジは攻撃に勝ち投げに負け、ジョーカーは攻撃・投げに勝ちブロック・ダッジに負け）。2012年Bestcovery Best Card Game受賞 — [Wikipedia Yomi](https://en.wikipedia.org/wiki/Yomi_(card_game)), [GamesBeat](https://gamesbeat.com/?p=106268)
12. **Skull** — 各人1ドクロ+3花のディスクを裏向きに積み、ビッドで公開枚数を宣言。厳密には「同時」ではなく逐次の隠し置きだが、隠し選択+ブラフが核。2勝で勝利、2011年Hervé Marly作 — [BGA Skull](https://en.doc.boardgamearena.com/Gamehelpskull), [Official Game Rules](https://officialgamerules.org/game-rules/skull/)
13. **Sealed-bid auction（FHE事例）** — Zama公式がFHEで入札を暗号化したまま保持する封印入札NFTオークションの例を提供。ZamaのトークンセールでもFHE入札でfront-runningやガス戦争を防ぐ設計(入札価格は公開、数量は秘匿) — [Zama docs](https://docs.zama.org/protocol/examples/auctions/sealed-bid-auction), [Zama Blog](https://www.zama.org/post/onchain-confidential-single-price-auction-tokens-with-sealed-bids-using-zama)
14. **Pokémon系の同時行動選択** — 本調査では「同時技選択が読み合いを生む」ことを裏付ける一次的出典を取得できず(ランキング/使用率データのみ。Pokémon Champions: [pokemon-zone](https://www.pokemon-zone.com/champions/ranked-seasons/))。→Gaps
15. **既存のFHEゲーム試作** — Crackd(暗号化コードを使う1v1コード解読)、FHERPG(クイズ) — [Zama community Crackd](https://community.zama.org/t/crackd-a-confidential-1v1-code-breaking-game-where-your-code-is-encrypted-on-chain-fhevm/4506), [FHERPG](https://github.com/0xWhitmore/FHERPG)

### Inferences
各ゲームの詳細評価（人数/ラウンド長/魅力/リプレイ要因/弱点/FHEスコア）。※人数・時間・魅力・弱点のうち出典のない部分は一般知識に基づく調査者の判断。

| # | ゲーム | 人数/1ラウンド | 魅力(緊張・ブラフ・メタ・社会比較) | リプレイ要因 | 弱点 | FHEスコア(1-5)と理由 |
|---|---|---|---|---|---|---|
| 1 | Minority Game / 少数決 | 奇数人・多数(数十〜数千)/数秒〜数分 | 「少数派に入る」快感、群衆の逆張り | 毎回の結果が前回履歴に依存、ストリーク | 長期では混合戦略(50%)が最適で戦略が単調(推論)、共謀/Sybilで操作されうる | **5**: 大人数が同時に秘密投票し集計だけ公開、という構造がFHE(暗号文の加算とselect)にそのまま対応し、最後に動く者の有利がゼロになる |
| 2 | Beauty contest 2/3 | 3人〜数千/1手(数十秒) | 「他人は何手先まで読むか」の知的快感、社会的比較(平均との差) | 毎回の平均が変わり、収束後は目標が動く | 収束すると0に潰れる、上位が固定的になる(推論) | **5**: 平均の暗号文計算と「最近接」判定だけで成立し、集団の思考水準という見えない値が可視化されるためFHE向き |
| 3 | RPS系(minus-one, 限定ジャンケン) | 2人/数秒 | 心理読み、手札制限による有限資源の緊張 | 手札/星の消費で毎回違う局面 | 単純RPSはランダムが最適で戦略が薄い(推論)、手札管理は解読可能 | **4**: 隠し手札の暗号化とcommit-reveal不要の同時公開が価値だが、2人用で対戦相手の確保がボトルネック |
| 4 | Colonel Blotto | 2人〜/1手(配分) | 配分の読み合い、集団版は順位ゲーム化 | 戦場数/予算の変更で無限にバリエーション | 最適戦略が解析済みで、上級者は混合戦略に収束(出典: 上記Wikipedia) | **4**: 複数値の秘密配分+一括比較は暗号文の比較演算で素直に実装でき、集団トーナメント化しやすい |
| 5 | Sealed-bid auction系 | 多数/1入札 | お金の駆け引き、勝者の呪い | 毎回の価値が異なる | front-running・談合、入札者の選好が漏れる | **4**: 既にZamaがFHEで実装例を持つため技術的リスクは低いが、「ゲームとしての新規性」は差別化しにくい |
| 6 | Diplomacy | 7人/数時間〜週 | 交渉+裏切り、「同時に命令を出す」瞬間 | 7国×交渉の組み合わせ | 長時間、脱落者の待機、kingmaking、審判(GM)が命令を預かる(出典: ルール上命令を書いて同時公開) | **3**: メール/オンライン版の審判依存と非同期の不正を除ける価値はあるが、ゲームが重く大衆向けではない |
| 7 | Libertalia | 3-6人/10〜15分/ターン内は同時選択 | 手札を読んで被りを避ける | カード構成の変化 | 全員同一手札で被りが頻発し運に左右される(出典: 上記レビュー) | **3**: 隠し選択をFHE化できるが、ボードゲームとしての1ゲームの長さと満足度でFHEの利点が薄れる |
| 8 | 7 Wonders | 3-7人/30分 | ドラフトで他者の選択が間接的に見える | 多数の文明・カード | 同時選択が「ほぼ公開情報のドラフト」に近く隠匿の価値が小さい | **2**: 隠すべき情報が少なく(推論)、FHEの価値が薄い |
| 9 | Yomi | 2人/30分前後 | 格ゲー的な読み合い、キャラ性 | キャラ別デッキ10種 | 2人専用で相手が必要、非同期ではスワップ送信が必要 | **3**: 隠し手札+キャラ愛着と相性が良いが、2人戦の同時性が一部のオンライン版で既に実現済み |
| 10 | Skull | 3-6人/15分 | ブラフと度胸 | 少人数で回しやすい | 逐次の置き方なので真の同時性はない、非同期では不利が出る | **3**: 裏向きディスクのFHE化は技術的には自然だが、「顔の見える」ブラフが価値の核でオンチェーン化の優位が小さい |
| 11 | Kaiji限定ジャンケン | 2人(最大4)/約3星・カード数枚 | 命がけ・借金の物語、手札残の計算 | 物語・IPの力 | カード公開の信頼、サクラ/イカサマ(作中で題材) | **4**: 「審判・封筒への信頼」を暗号で置き換えられる物語と一致し、IPなしでも成立する |
| 12 | Alice in Borderland / Squid Game的デスゲーム全般 | 多数/数分 | 生存の緊張、新ルール追加の新鮮さ | 毎回新ルール | IP依存、倫理(死が絡む)で改変が必要 | **3**: 世界観の演出としては強いが、FHE固有の価値は「同時秘密選択」部分に限られる |
| 13 | Pokémon系同時技選択 | 2人/1ターン | 読み合い、育成との結合 | 育成、メタ、キャラ愛着 | 通常はサーバが審判で信頼問題は小さい | **2**: サーバ運営で信頼問題は解決済みで、FHEの差別化は弱い |

### Gaps
- 各ゲームのプレイヤー数・ラウンド時間・魅力の評価は、BoardGameGeek(一次)から直接取得できなかった。上の表の一部は一般知識+レビュー記事による推論。
- Kaiji限定ジャンケンの正確なルール（星・カード枚数・勝敗判定）はfandom/pixivが取得不可のため一次確認できず。
- ライアーゲーム少数決の脱落条件・結末は未確認。
- Pokémon同時技選択、Mario Partyミニゲーム、モバイルヒット作（同時選択系）の一次出典は未取得。
- Battle Line(同時選択ではなく逐次の札配置で、本リストから外すのが妥当)は未調査。

## Q2. 信頼/秘匿の問題（ピーキング、審判依存、非同期での後手有利）でFHEが効く点

### Takeaway
オンチェーンの素朴なcommit-revealは「最後に公開する者が他者の値を見て公開を放棄できる」「公開の遅延・無公開による停止」「コミットをオンチェーンで生成すると秘密が見える」という弱点を持つ。FHEは暗号文のまま結果計算するため、公開フェーズ自体を不要にし、最後の公開者問題と放棄問題を構造的に取り除く可能性がある。

### Cited Findings
- 最後に公開する者は他者の値を見て、公開するか保証金を放棄するか選べる — [Chainlink commit-reveal解説](https://chain.link/article/commit-and-reveal-schemes), [Spark glossary](https://www.spark.money/glossary/commit-reveal-scheme)
- 緩和策は担保金・公開期限・不公開時のペナルティ。Commit-Reveal²(2025)は公開順序のランダム化とVDF、オンチェーンのフォールバックで最後の公開者攻撃を減らす — [arXiv 2504.03936](https://arxiv.org/pdf/2504.03936v2)
- commit-revealはfront-runningの最悪ケースは防ぐが、2メッセージと遅延のコストがある(Canidio & Danos, Management Science 2024) — [HAL](https://hal.ccsd.cnrs.fr/INRIA/hal-04310265v1), [EconPapers](https://econpapers.repec.org/RePEc:inm:ormnsc:v:70:y:2024:i:7:p:4429-4440)
- コミットをオンチェーンで生成すると秘密と推測がトランザクションに丸見えになる。コミットはオフチェーンで作る必要がある — [Speedrun Ethereum](https://speedrunethereum.com/guides/commit-reveal-scheme)
- FHEの封印入札例では入札はローカルで暗号化され、オークション中は暗号化されたまま。ZamaのトークンセールではFHE入札がfront-runningとガス戦争を防ぐ目的 — [Zama docs](https://docs.zama.org/protocol/examples/auctions/sealed-bid-auction), [Zama blog](https://www.zama.org/post/onchain-confidential-single-price-auction-tokens-with-sealed-bids-using-zama)
- Diplomacyは審判役が命令を同時公開して解決する形式に依存(ルール上、命令は同時に公開される) — [Wizardsルール](https://media.wizards.com/2015/rules/diplomacy_rules.pdf)
- 乱数が欲しいだけの場合はChainlink VRFがcommit-revealの代替になるが、両者が手を選ぶRPSのような用途には使えない — [Chainlink](https://chain.link/article/commit-and-reveal-schemes)

### Inferences
- 信頼問題が最も重い順: (1)オンライン/メール版Diplomacy(審判が全命令を見る)、(2)非同期の対戦(後手が先手の公開を待てる)、(3)多人数少数決(集計者の信頼)、(4)封印入札(オークショニア信頼)。
- FHEで解決しにくい点: 暗号文の長さ/タイミングなどのメタデータ漏洩、復号権限(誰がいつ復号するか)、Sybil/共謀、ガス/HCUコスト。これらはFHE単独では解決しない(一般知識・未検証)。
- Zamaの既存事例が「入札」型に偏っており、ゲーム体験(連続プレイ、順位、キャラ)に踏み込んだ事例は少ないため、そこに差別化余地がある。

### Gaps
- FHE演算の実コスト(HCU上限、ラウンド当たりガス)の定量値は本調査未取得。
- 「最後の公開者問題」がFHE版でどう再現/消滅するか(復号フェーズのタイミング)の厳密な検討は未実施。

## Q3. 大衆向けに中毒性を持たせるゲームデザインの教訓と、日本のモバイル層向けメカニクスの接続

### Takeaway
日本のモバイル層はキャラクター(調査では重視度77%)と使いやすさを重視し、コレクション/育成が課金動機。ただし日本のガチャ系の70%超が3年以内に終了するとの二次報道もあり、継続にはコンテンツ深度と更新頻度が必須。同時秘密選択ゲームにはキャラ・育成・ランクを被せるのが筋だが、「勝敗の運と実力の比率」を設計する必要がある。

### Cited Findings
- 日本のプレイヤーは「キャラクター(77%)」「使いやすさ(73%)」をモバイルゲームで最重要と回答(Asmarq調査をAutomatonが引用) — [Automaton](https://automaton-media.com/en/news/japans-gacha-game-market-collapse-is-near-japanese-media-reports-but-is-the-market-simply-streamlining/)
- コレクション(ガチャによるキャラ/アイテム収集)は日本のトップ課金動機で、IP系はウマ娘など高水準。ベンダーのブログ(方向性のみ) — [Playio](https://blog.playio.co/japanese-mobile-gamer-analysis-market-insights)
- プロ野球スピリッツAや学園アイドルマスターなどスポーツ/育成要素付きガチャが長期間トップセールスに残る — [Automaton](https://automaton-media.com/en/news/japans-gacha-game-market-collapse-is-near-japanese-media-reports-but-is-the-market-simply-streamlining/)
- ウマ娘は女性が75%超、長期継続はコンテンツ深度とアップデート頻度に依存すると分析 — [FoxData](https://foxdata.com/en/blogs/anime-mobile-game-shift-from-female-driven-growth-to-immersive-content-and-long-term-engagement/)
- ウマ娘: 2025年1月時点で累計2200万DL超。グローバル版(2025年6月26日Steam)が米国など複数国で売上1位。サイバーエージェントのゲーム事業は2025年9月期売上2,167億円(前年比10.6%増)、営業利益600億円 — [Game*Spark](https://www.gamespark.jp/article/2025/11/14/159493.html), [GameBusiness.jp](https://www.gamebusiness.jp/article/2025/07/18/24678.html)
- 日本のガチャ/ライブサービスの70%超が3年以内に終了、との報告(二次情報) — [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/japans-gacha-game-bubble-bursts-as-most-titles-die-within-3-years)
- コンプガチャは2012年に違法化され、収集型メカニクスの設計制約になっている — [Automaton/Outlook記事の関連記述](https://automaton-media.com/en/news/japans-gacha-game-market-collapse-is-near-japanese-media-reports-but-is-the-market-simply-streamlining/)(検索結果の要約; 一次の法令は未確認)
- 実験データ上、2/3ゲームは繰り返すと平均が下がり0へ収束し、勝者の模倣が学習を加速する — [Wikipedia](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average)。(＝「自分の読みの精度が上がる」成長感の根拠になりうる)

### Inferences
- 同時秘密選択ゲームに接続できる日本型メカニクス: (1)キャラクターに「性格=選択傾向」を持たせ、育成でAI/ビルドが成長(ウマ娘的な育成+レース結果の予測)、(2)収集は「選択肢の種類」(Blottoの配分パターン、Yomiのデッキ)に当てる、(3)ランクとシーズン制(Pokémon Championsのシーズン制ラダーが前例: [pokemon-zone](https://www.pokemon-zone.com/champions/ranked-seasons/))、(4)連勝ストリークと「少数派に入った回数」の称号、(5)毎日1ラウンドの短時間プレイ(Wordleのような共有可能な結果)。
- 運と実力: 純粋RPSやMGは均衡がランダムなので「読み」で上達できる余地が小さい。2/3ゲームやBlottoは思考水準で差が付き成長感を作りやすい(推論)。
- 規制/ギャンブル性: 賞金付きになると賭博規制に触れうるため、トークン報酬の設計は別途法務確認が必要(一般知識)。

### Gaps
- パズドラ・パワプロ・シンデレラガールズの具体的なリテンション数値(D1/D7/D30)は取得できず。
- GDC講演など一次のリテンション設計資料は未取得。
- 同時選択系のモバイルヒット作(定量データ付き)は特定できず。

## Q4. FHEリブランド可能性スコア一覧（要約）

### Takeaway
FHEと最も相性が良いのは「多人数・1手・集計結果だけ公開」型(Minority Game/少数決, 2/3 beauty contest)で各5。次点は秘密配分/手札型(Blotto, 限定ジャンケン, 封印入札)で4。審判依存が強いが重い(Diplomacy)・隠匿価値が小さい(7 Wonders, Pokémon)は低め。

### Cited Findings
- スコアの根拠とする構造的事実は上記Q1〜Q3の各引用を参照（Minority Gameの混合均衡と大人数性: [Wikipedia](https://en.wikipedia.org/wiki/El_Farol_Bar_problem); 2/3ゲームの大規模プレイ(19,196人): [Wikipedia](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average); Zamaの封印入札例: [Zama docs](https://docs.zama.org/protocol/examples/auctions/sealed-bid-auction))

### Inferences
- スコア順: Minority Game/少数決 5, 2/3 beauty contest 5, Blotto 4, 限定ジャンケン 4, 封印入札 4, RPS系 4, Diplomacy 3, Libertalia 3, Yomi 3, Skull 3, デスゲーム系 3, 7 Wonders 2, Pokémon 2（理由はQ1の表に一文で記載）。
- Minority-Rush(本リポジトリ)の名前通り、Minority Game+2/3型の「少数派/平均接近」を短時間の連続ラウンドで回し、ランク・称号・キャラで装飾するのが最もFHEの強みを活かせる方向と考えられる。

### Gaps
- スコアは調査者の主観で、市場規模や実装コストの定量評価は含まない。
- 競合する既存のオンチェーン少数決/ビューティコンテストゲームの網羅調査は未実施。
