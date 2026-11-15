# 数値ファクトチェック: ゲーム収益減衰 / Web3ゲーム崩壊

検証日: 2026-11-14。方法: WebFetch で実ページを開いて確認。検索スニペットのみで見たものは「スニペットのみ」と明記。

## 判定表

| # | 主張 | 判定 | 開いたURL | 記載の数値(日付) | 引用(15語以内) |
|---|------|------|-----------|------------------|-----------------|
| 1a | ZZZ 2年目の支出が初年度比 約51%減 | CONFIRMED | https://www.pocketgamer.biz/zenless-zone-zero-celebrates-two-years-with-over-600m-on-mobile/ | 2年目 $198.9m(51%減)、累計 $603.9m(2026-07-13、AppMagic推計) | "down 51% to $198.9m" |
| 1b | 原神の2年目累計収益が約17%... | PARTLY(主張が不完全) | 同上 | 17%は「ZZZの2年累計が原神の2年累計($3.6bn)の17%」。原神2年目の対初年度比ではない | "17% of the flagship's two-year sum on mobile" |
| 1c | 崩壊スターレイルの年次減少 | PARTLY | https://mobilegamer.biz/the-top-grossing-mobile-games-of-2025/ | 暦年: 2024年 $562m → 2025年 $423m(約-24.7%)(2026-01-13、AppMagic) | "had a very spiky year" |
| 2 | Hamster Kombat 約3億人→約3000万MAU(約85%減) | PARTLY | https://cointelegraph.com/news/hamster-kombat-5-billion-volume-11-million-holders | ピーク3億(2024年8月、MAUと記述)→4100万MAU(11/5)=86%減。出典データ元は記事に明記なし | "fallen from a peak of 300 million in August" |
| 2補 | 同上(3000万の出所) | PARTLY | https://coinmarketcap.com/academy/article/hamster-kombat-plans-comeback-amid-drop-in-monthly-active-users | "approximately 30 million" MAU。データ元は非明記(約1年前の記事) | "decrease to approximately 30 million" |
| 2補 | 同上(Decrypt) | PARTLY | https://decrypt.co/289725 | Telegramデータで直近1か月 "44百万未満"、9月末は1億超(2024-11-02) | "fewer than 44 million users have played" |
| 3 | Pixels 2026年3月 約32万DAU vs 2024年約100万DAU | CONTRADICTED(日付が誤り) | https://www.blockchaingamer.biz/?p=30734 | 32万DAUW(うち継続27.5万)は2024年3月5日更新記事、Footprint Network ダッシュボード。2026年3月の値ではない | "over 320,000 DAUWs" |
| 3補 | 100万DAU(2024) | CONFIRMED(会社主張) | https://www.theblock.co/post/294058 | 100万DAU(2024-05-13)。定義は記事に記載なし | "surpassed 1 million daily active users" |
| 4a | Fantasy Top 2026年5月に閉鎖発表 | CONFIRMED | https://decrypt.co/368640 | 2026-05-21発表、6月末終了、競技は6/18まで。Blast上で2024年ローンチ | "none reached durable market fit" |
| 4b | Pudgy Party 閉鎖 | CONFIRMED | https://decrypt.co/371197/pudgy-penguins-nft-game-pudgy-party-shuts-down | 2026-06-12にiOS/Androidから削除。2025年8月ローンチ。DL数は記事上 "millions"(他報道は1M超) | "flagship gaming product of the Pudgy Penguins universe" |
| 5a | Axie ピーク270万から約90%減 | PARTLY | https://reports.tiger-research.com/p/axie-infinity-eng | 270万→35万 DAU、約90%減(報告書2024-02-15。35万の時点は不明) | "DAUs dropped from 2.7 million to 350,000" |
| 5a補 | 同上(The Block) | PARTLY(ピークが異なる) | https://www.theblock.co/post/146915/the-decline-of-axie-infinity | ピーク250万(2021年11月)→120万(2022年4月)=約52%減 | "fallen from 2.5 million in November 2021" |
| 5b | STEPN DAUが2022年に約90%減 | CONFIRMED(期間限定) | https://decrypt.co/111809/crypto-fitness-app-stepn-denies-layoff-reports | DAU 58,000(6/21)→5,800(9/15)=90%減(2022)。データ元は記事で非明記 | "a peak of 58,000 on June 21 to just 5,800" |
| 6a | Dark Forest 2020年 約600人 | CONFIRMED | https://blog.zkga.me/v4-recap | v0.4で約600人(2020-10-21投稿)。収益の記述なし | "Nearly 600 players participated in the round." |
| 6b | v0.6で約1,900人/ラウンド | CONFIRMED(v0.6 Round 2) | https://blog.zkga.me/v6-r2-wrapup | 約1,900人(2021-07-16)。v0.6全ラウンドの値ではない | "Nearly 1900 players participated in this round." |
| 6c | 収益ゼロ | UNVERIFIABLE | 上記2ページ | 収益に関する記述自体なし(「ゼロ」を裏付けるページなし) | - |
| 7 | Telegramタップゲーム Q4 2024 継続率 5〜20% | CONFIRMED | https://www.theblock.co/post/339563/telegram-games-had-trouble-earning-revenue-retaining-users-in-q4-report | Helika報告、2025-02-07。従来ゲーム基準20〜30% | "hovered at 5–20%, far below traditional gaming benchmarks" |

## 注記

- **#1**: 出典はSensor TowerではなくAppMagic(除外: Web shop、中国の第三者Android)。原神の年次(約19億/18億/16億ドル)や「年間42%減」は検索スニペットで見ただけで未開封。HSRの「2年目 vs 初年度」の公式比較ページは見つからず、暦年比較のみ確認。
- **#2**: 「プレイヤー」ではなくMAU表記が正しい。3億は8月ピーク、定義は記事に記載なし。「約3000万」はCoinMarketCap 1本のみで、多数の報道は4100万(86%減)。85%減を使うなら「4100万=86%減」が出典付きで安全。
- **#3**: 最大の誤り。32万は2024年3月の値で、100万DAU(2024年5月)より前。「2026年3月に32万」は不成立。2026年の別数値(スニペット上、11.5万DAUW等)は未開封で未検証。
- **#4**: Decryptは基盤をBlast(Ethereum L2)と記述。Pudgy Partyは別記事で確認。
- **#5**: ピークは出典で2.5M/2.7M/2,718,810(スニペットのみ)と食い違う。「約90%」は2.7M→35万の1出典のみ。The Blockでは2022年4月時点で約52%減。
- **#5b**: 90%は6月〜9月の約3か月のピーク比。月間ユーザーは別指標。
- **#7**: Helika原本は未開封(The Blockの引用のみ)。

## スニペットのみ(未開封)
原神の年次収益、Messari STEPN DAU 80%減、STEPN MAU 705,452→42,965、Axie 2,718,810(2021-11-15)、Pixelsの2026年数値、HSR 2026年1月 約800万ドル。
