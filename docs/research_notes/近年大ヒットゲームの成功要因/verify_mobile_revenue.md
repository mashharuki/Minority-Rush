# モバイルゲーム売上の数値ファクトチェック

実施日: 2026-11-14。WebFetch で本文を開いたページのみを「確認済み」とし、検索スニペットのみのものは別枠にした。

| # | 主張 | 判定 | 実際に開いたURL | ページ記載の数値(日付) | 引用(15語以内) |
|---|---|---|---|---|---|
| 1a | ウマ娘 国内年別売上 2021年$965.3M→2024年$368.3M(AppMagic)、累計約$2.5B | CONFIRMED | https://www.pocketgamer.biz/uma-musume-pretty-derby-gallops-past-25bn-in-japan-alone/ | 2021: $965.3M / 2022: $690.8M / 2023: $451.7M / 2024: $368.3M。累計「$2.5B超」(総額ベース、2025-03-18記事) | "ended that year at $965.3 million" |
| 1b | 初期後WAU約2M維持 | UNVERIFIABLE | 上記記事・下記記事とも記載なし | WAUの記載なし(上記記事はインストール22M(2025年1月)のみ) | - |
| 1c | 2025年6月グローバル版、売上の約70%が米国 | CONTRADICTED(要修正) | http://www.pocketgamer.biz/uma-musume-pretty-derby-picks-up-57-of-mobile-revenue-outside-japan-in-two-months-since-global-launch/ | 2か月で米国$31M、海外$46.8Mの約66%。日本含む全体($82.2M)では約38%(後者は検証者の計算)。2025-08-27記事 | "The US has led overseas spending at $31m over two months." |
| 2 | 学マス、初月にバンダイナムコENT モバイル売上の約40% | CONFIRMED(「40%以上」) | https://gamebiz.jp/news/389754 ; https://sensortower.com/ja/blog/great-start-gakuen-idol-master | 2024-05-16〜06-15の期間でBNEモバイル収益の40%以上(Sensor Tower、2024-07)。その後の売上推移はどちらのページにも記載なし | "リリース初月で40％以上のシェアを占め" |
| 2b | 学マスのその後の売上 | UNVERIFIABLE | 開いたページに記載なし | - | - |
| 3a | Pokemon TCG Pocket 最初の6週間で約$180M | PARTLY | https://gameworldobserver.com/2024/12/13/pokemon-tcg-pocket-60m-downloads-revenue-mobile | AppMagic: 約$185M超(純IAP収益、2024-10-30〜12-12、記事2024-12-13)。$180MはFortune/SCMP/Sensor Tower系の別推計(スニペットのみ) | "AppMagic estimates Pokémon TCG Pocket's revenue at just over $185 million." |
| 3b | 2025年後半は月約$40M | PARTLY | https://mobilegamer.biz/decembers-top-grossing-mobile-games-2/ ; https://www.pocketgamer.biz/pokmon-trading-card-game-pocket-celebrates-second-anniversary/ | 2025年12月: 約$36.4M(AppMagic、2026-01-08)。2年目(1年目比)純収益$233.7M、前年比-68%、月平均約$19.5M(算出)。2025年9月約$27M、2026年4月約$31.4Mはスニペットのみ | "$36.4m" (December 2025) |
| 4a | Block Blast 年間DL | PARTLY(数値入手) | https://www.blog.udonis.co/statistics/block-blast | AppMagic: 2023: 138M / 2024: 240M / 2025: 363M / 2026年初〜: 121M / 累計870M(2026-06-09)。MAF記事は2025年368M(スニペットのみ) | - |
| 4b | 月間売上約$17.5M | UNVERIFIABLE(性質に注意) | 同上 | 無名の「アナリスト」(Gamigion)推計で約$17.5M/月(日$584K)。ほぼ全額が広告収益で、IAPは累計約$66K。公式・AppMagic数値ではない | "monetizes almost entirely through advertising" |
| 5a | 日本市場、2026年7月までの1年で$10B超、-5.1% | CONFIRMED | https://sensortower.com/blog/state-of-japan-gaming-2026 | IAP収益 約$10B(¥1.56兆)、前年比-5.1%、2026年9月公開 | "over USD $10 billion (¥1.56 Trillion)" |
| 5b | 2026年上位5(eFootball、モンスト、Last War、Whiteout Survival、ウマ娘) | CONFIRMED | 同上 | 1〜7月収益順: 1 eFootball, 2 モンスト, 3 Last War, 4 Whiteout Survival, 5 ウマ娘(通年ではなく1〜7月) | - |

## 補足(オポチュニスティック調査)

- ウマ娘の育成1周のターン数・所要分数: game8(https://game8.jp/umamusume/372297)を開いたが記載なし。altema等は検索結果のみで未確認。UNVERIFIABLE。
- 学マスのプロデュース1周のターン数・所要分数: game8(https://game8.jp/gakuen-idolmaster/686449)を開いたが記載なし。UNVERIFIABLE。APは1消費15分回復、プロデュース15AP消費(検索スニペットのみ。プレイ時間ではない)。
- 1aの注意: 年別4値の合計は約$2.48B。記事の累計「$2.5B超」は2025年分を含み、年別表は2024年までのため矛盾ではないが厳密には一致しない。ウマ娘の数値は「ストア手数料込みの総額」(記事の表現は gross)。
- 3の注意: AppMagicは手数料控除後の純収益、他社推計は総額ベースなど定義が異なり直接比較不可。
- 本ファイルの「スニペットのみ」と書いた項目は、ページ本文を開いて確認していない。
