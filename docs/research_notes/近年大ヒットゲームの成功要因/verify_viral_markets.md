# 数値クレームのファクトチェック（バイラルゲーム・Wordle・予測市場）

検証日: 2026-11-14 / 方法: WebFetchで実ページを開いて確認（検索スニペットのみのものは明記）

## 判定表

| # | クレーム | 判定 | 開いたURL | ページが述べる数値・日付 | 引用（15語以内） |
|---|---|---|---|---|---|
| 1a | Grow a Garden ピーク約22M | PARTLY | https://www.tubefilter.com/2025/08/25/roblox-grow-garden-steal-brainrot-admin-war-record/amp/ （2025-08-25） | 自己最高は21.6M（2025年6月）。8/23のAdmin Warでは21.1M。PocketGamer.bizは「near 22.4m record」と記載し媒体間で不一致（21.3M/21.6M/21.9M/22.4M） | "all-time high is 21.6 million"（要約。原文引用ではなくTubefilter記述の言い換え） |
| 1b | Steal a Brainrot ピーク約25M | CONFIRMED | http://www.pocketgamer.biz/robloxs-steal-a-brainrot-becomes-first-game-to-surpass-25m-concurrent-players/ （2025-10-07） | 25.4M。RoWatcherは25.8M（2025年10月、Yin Yangイベント）と記載 | "Steal a Brainrot has hit a record 25.4 million concurrent users." |
| 1c | 数か月後の減少幅 | UNVERIFIABLE（一部PARTLY） | https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals （日付なし、2026年3月下旬頃と推測） | Steal a BrainrotはピークからCCU約215,000で99.2%減（同記事内に57,000という別数値もあり）。Grow a Gardenの減少数値は一次的に確認できず（PCGamesN/Roonbyは数値なし） | "99.2% from peak"は取得ツールの要約、原文照合は不完全 |
| 2a | Wordle 11.2B plays | PARTLY | https://www.clickondetroit.com/business/2026/01/21/this-just-in-from-the-new-york-times-its-first-2-player-game-and-an-evolving-business-model/ （2026-01-21）, https://www.nbcnewyork.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/6436464/ （2025-12-29） | 11.2Bは**NYT Games全体**の2025年の数値であり、Wordle単体ではない。Wordle単体は4.2B（2024年5.3B、2023年4.8B）。NBCは「puzzles solved」、別記事は「played」で定義が揺れる | "collectively played over 11.2 billion times in 2025"（要約） |
| 2b | 共有グリッド追加2021-12-16、その後成長 | PARTLY | https://en.wikipedia.org/wiki/Wordle , https://techcrunch.com/2022/05/04/wordle-new-york-times-user-growth | 開いたページは12月16日を明記せず「2021年12月下旬にTwitterでバイラル化」。12/16は検索スニペット（未確認）。成長は90人（2021-11-01）→30万超（2022-01-02）→翌週200万超。TechCrunchは共有グリッドを主因と評価 | "90 players on November 1, 2021, to over 300,000"（要約） |
| 2c | BONGO 36,337ストリーク | CONFIRMED | https://www.nbcnewyork.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/6436464/ （2025-12-29） | 2025年5月14日のBONGOが36,337本のストリークを断った。データ提供はNYT Games | "biggest streak buster... snapped 36,337 streaks back on May 14." |
| 3 | Polymarket 5分・15分市場が日次手数料の約40%（Messari） | PARTLY | https://app.blockworks.com/report/a-game-of-volatility （messari.ioから301、2026-05-12、Blockworks Research） | 対象はBTC限定ではなく**5分・15分の暗号資産市場全体**。出来高の約16%で日次手数料の「nearly 40%」（約$400K/日） | "nearly 40% of the platform's daily fees at around $400K per day." |
| 4 | Stake 2024年GGR $47億 | PARTLY | https://dailyhodl.com/2025/04/22/crypto-gambling-generates-81400000000-in-gross-revenue-at-casinos-last-year-despite-regulatory-bans-report/ （2025-04-22） | $4.7B。**会社自己申告**（"according to the company"）で独立監査ではない。IMGLは「争いのある数字」と注記（スニペットのみ） | "pulled in $4.7 billion in GGR last year, up 80% from 2022" |
| 5 | Sorare 無免許ゲーム運営で刑事訴追 | PARTLY | https://www.casino.org/news/sorare-com-pleads-not-guilty-to-unlicensed-gambling-in-uk/ （2024-10-08）, https://www.gamblingcommission.gov.uk/about-us/freedomofinformation/sorare-prosecution | 場所は**英国**（Birmingham Magistrates' Court）。英Gambling Commissionが2024年9月末に無免許ギャンブル提供3件で起訴。2024-10-04に無罪答弁。審理は2025-06-16開始予定。**判決・結末は確認できず**。パリ検察の事案は見つからず | "adjourned for trial commencing 16 June 2025"（FOI応答の要約） |
| 6a | Among Us ピーク約500M MAU | PARTLY | https://www.pocketgamer.biz/among-us-hit-500-million-monthly-active-users-in-november/ （2020-12-22） | SuperData推定で2020年11月に500M超のMAU（10月は295M）。WikipediaはMAUでなく「約500Mプレイヤー」、Steam同時接続ピーク3.8M（2020年9月下旬） | "over half a billion monthly active users in November" |
| 6b | Among Us 2020年バイラル経緯 | CONFIRMED | https://en.wikipedia.org/wiki/Among_Us | モバイル2018年6月、Steam 2018-11-16。2020年中頃に韓国・ブラジルの配信者から拡大、Sodapoppinが2020年7月にTwitchで火付け、コロナ禍の影響 | （要約） |
| 6c | Fall Guys ローンチ数値 | UNVERIFIABLE（スニペットのみ） | PC Gamerのページは冒頭のみ、nichegamerは403で本文未取得 | スニペット上は、2020-08-04発売、初週Steam200万本、2020-08-26にSteam700万本（約3週間）。開いたページで日付・主体は未確認 | — |
| 6d | Balatro 販売本数 | CONFIRMED | https://gameworldobserver.com/2025/01/21/balatro-another-1-5-million-copies-total-5m-units （2025-01-21） | 全プラットフォーム合計500万本。2025-01-20にPlaystack CEOが発表。Apple Arcade等のダウンロードは含まれない（スニペット） | "has now sold 5 million units globally" |
| 6e | Vampire Survivors 販売本数 | PARTLY | https://www.videogameschronicle.com/news/vampire-survivors-developer-is-working-on-over-15-games-including-working-with-famous-franchises/ （2026-04-22） | Poncle公式は**2,700万「プレイヤー」**（販売本数ではない）。販売本数の公式値は確認できず（100万本超は初期のスニペット情報、Steam推定600万本等は第三者推定） | "surpassed 27 million players, according to Poncle" |

## 補足メモ

- 開いたページと、検索スニペットだけで見た情報は上表で区別した。スニペットのみ: Fall Guysの数値、Stakeの「争いあり」注記、Wordle共有ボタンの12/16日付、Sorareの無罪答弁日。
- 1c: 減少幅はトラッカー（RoMonitor/Rolimons）の一次ページを開けておらず、RoWatcher記事も日付と数値が内部で不整合。「数か月で大幅減」という方向性は妥当だが、具体的な割合は使用前に再確認が必要。
- 2a: 「Wordle 11.2B plays」は誤り。11.2BはNYT Games全体、Wordleは4.2B。
- 3: 「BTC」限定ではない点に注意。Dune系の「BTC 5分・15分が暗号資産手数料の72%」は別指標（スニペットのみ）。
- 5: 「刑事訴追」は英国の規制当局による訴追で、結末は未確認。
- 一部の引用は取得ツールの要約文であり、原文の逐語ではない（引用欄に「要約」と記載）。
