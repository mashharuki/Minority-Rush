# 少数派の読み合いで育てて遊ばせる

結論から言うと、Minority Rush を「熱中して何度も遊ぶ公開ゲーム」にする最短ルートは、**N 人の同時秘密選択を集計して精算する「少数派ラウンド」を核に据え、その周りを育成・収集・シーズン制で包み、乱数は同点処理と育成の揺らぎにだけ使う**ことである。FHE が本当に必要なのは「多人数の秘密入力を、誰も途中結果を見られず、開示を放棄されることもなく集計する」場面と「賭け額・残高の秘匿」であり、2 人対戦のじゃんけんや 1 人用の運試しでは commit-reveal や VRF で代替できる。待ち時間は、FHE 計算そのものより「入力確定 → 公開復号要求 → relayer 応答 → 検証」という複数ステップのチェーン往復が支配すると見られるが、公式の実測値は見つからなかったため、数十秒〜の待ちを前提に「ラウンド締切までの作戦時間」と「開票演出」として設計に織り込むべきである。商業的に成功した隠し情報オンチェーンゲームは調査範囲で確認できず、人気オンチェーンゲームの失速は技術ではなくトークン経済の崩壊が原因だった。したがって FHE は看板ではなく「運営も見えない公平さ」という信頼の裏付けに留め、面白さは日本のモバイル層が重視するキャラクターと育成で作るのが妥当である。賭け金付きのまま一般公開すると賭博規制の論点が生じるため、公開版はポイント制を基本とし、法務確認を別途行う必要がある。以下、事実（出典付き）と調査者の評価・推定を分けて述べる。

## 同時秘密選択ゲームの中で Minority Rush が最も FHE 向きである

同時秘密選択の系譜は、循環的な読み合い（Yomi、じゃんけん系）、多数派・少数派の外し合い、他者の思考階層の推測、資源配分、交渉＋同時命令に分けられる。Minority Game は Challet & Zhang が 1997 年に提案した形式で、奇数人が毎ターン二択を選び少数側が勝つ。対称な決定論的戦略は均衡にならず、50% の混合戦略だけが対称ナッシュ均衡になる ([Wikipedia El Farol](https://en.wikipedia.org/wiki/El_Farol_Bar_problem), [arXiv](https://ar5iv.labs.arxiv.org/html/adap-org/9708006))。ライアーゲームの少数決は 22 名が投票し少数派が勝者になる形式で ([pixiv百科事典](https://dic.pixiv.net/a/LiarGame))、Minority Rush の原型とほぼ同じ構造である。もう一つの有力形式が「平均の 2/3 に最も近い人が勝つ」ゲームで、Nagel(1995) の初回平均は約 36、2005 年の Politiken 実験（19,196 人）では平均 33 で、繰り返すと 0 に収束し、勝者の模倣が収束を速める ([Wikipedia](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average))。数千人規模で成立し、結果が「集計値だけ」で決まる点が重要である。

なぜこれらが FHE 向きかは、素朴な commit-reveal の弱点から説明できる。最後に公開する者は他者の値を見て、公開するか担保を放棄するかを選べる ([Chainlink](https://chain.link/article/commit-and-reveal-schemes))。緩和策は担保金・期限・ペナルティだが、Canidio & Danos (2024) が指摘するとおり 2 メッセージ分の遅延コストも残る ([EconPapers](https://econpapers.repec.org/RePEc:inm:ormnsc:v:70:y:2024:i:7:p:4429-4440))。FHE は暗号文のまま加算・比較・選択ができ、必要な値だけを公開復号できるので ([Zama docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/oracle))、公開フェーズ自体が要らなくなる。調査者の評価では、FHE 適合度（1〜5、主観）は Minority Game/少数決が 5、2/3 ゲームが 5、Colonel Blotto・限定ジャンケン・封印入札・RPS 系が 4、Diplomacy・Libertalia・Yomi・Skull・デスゲーム系が 3、7 Wonders・Pokémon 系の同時技選択が 2 であった。理由は、7 Wonders は隠す情報が少なく、Pokémon はサーバが審判として機能して信頼問題が小さいためである。これらのスコアは検証されておらず、ユーザーテストも競合比較も未実施である。

既存の FHE ゲームは、封印入札（Zama 公式の NFT オークション例と、FHE 入札でフロントランとガス戦争を防ぐトークンセール ([Zama blog](https://www.zama.org/post/onchain-confidential-single-price-auction-tokens-with-sealed-bids-using-zama))）と、ハッカソン作品（暗号化コードを使う 1v1 の Crackd ([Zama community](https://community.zama.org/t/crackd-a-confidential-1v1-code-breaking-game-where-your-code-is-encrypted-on-chain-fhevm/4506))、Fhenix 上のブラフ＋ロシアンルーレット Bluff and Barrel ([HackQuest](https://hackquest.io/en/projects/Bluff-and-Barrel))、Inco 上のポーカー Pokerr ([Inco](https://www.inco.org/blog/eth-denver-recap))）に偏る。連続プレイ、順位、キャラクターに踏み込んだ事例は調査範囲で見つからず、ここが差別化の余地である。ただし網羅検索はしておらず、「不在」は断定できない。

## FHE が必須な場面は集計と秘匿残高に限られ、乱数だけなら不要である

FHE の必要性についての懸念には、次のように答えられる。必須になるのは、(a) 同時の秘密選択を集計しオンチェーンで精算する、(b) 他者に見えない賭け額やステーク、(c) 封印入札、(d) 戦闘時のみ公開される隠しステータス、(e) ERC-7984 による秘匿残高である。ERC-7984 は OpenZeppelin・Zama・Inco らの秘匿トークン標準で、cUSDC/cUSDT などのラッパーが稼働している ([Zama Protocol Update](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps))。これらは調査者の判断であり、出典は技術文書と一般的な暗号設計知識に基づく。一方、2 人のじゃんけんは commit-reveal で足り、1 人用の運ゲーは VRF やオフチェーン乱数で足りる。乱数だけを理由に FHE を採用すると装飾になりやすい。

乱数の公平性はそれ自体が重要な論点である。Fomo3D では block stuffing（約 40〜50 ETH のコスト）で最終勝者が 10,469 ETH を得て、別の攻撃者は block 由来の乱数を悪用した ([Hackernoon](https://hackernoon.com/the-anatomy-of-a-block-stuffing-attack-a488698732ae), [Medium](https://medium.com/@zhongqiangc/randomness-in-smart-contracts-is-predictable-and-vulnerable-fomo3d-part-1-4d500c628191))（2018 年の事例で古い）。VRF は乱数値の予測不能性を確保するが、同一ブロックでの参加と結果決定が危険なこと ([Mueller](https://muellerberndt.medium.com/building-a-secure-nft-gaming-experience-a-herdsmans-diary-1-91aab11139dc))、リクエスト順序を観察した前走りの可能性 ([IACR ePrint 2024/957](https://eprint.iacr.org/2024/957.pdf)) が指摘されている。Zama FHEVM は `FHE.randEbool()` と `FHE.randEuintN()`（8〜256bit）を提供し、値は暗号文のまま扱われ予測不能である。ただし上限指定は 2 の冪のみで、トランザクション内でしか生成できない（eth_call 不可）([Zama docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random))。コストは rand が約 23〜25k HCU、select が約 55k HCU と安価で、1 トランザクションの上限は 20,000,000 HCU である ([HCU docs](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu.md))。

FHE で直せないものも明確にしておく。排出テーブル自体の誤表示、課金誘導、未成年保護、運営によるコントラクト差し替え、KMS の信頼前提は残る。復号しない戦略的放棄（結果を見て復号を拒否する）が残る可能性も高いが、これは設計上の推論で、Zama 固有の検証はしていない（調査者の推定）。FHE は「確率が表示どおりに動く」ことを保証する道具であって、確率テーブルが公正であることまでは保証しない。

## 待ち時間は短縮できないが、ラウンド設計で遊びに変えられる

FHE 演算自体は速い。TFHE-rs v1.7 の 8×H100 構成での 64bit 演算は、加算 21.7ms、select 8.5ms、比較 21.9ms で、ERC-7984 転送は 1 件 51.5ms・1,040 TPS だが、これは「1 GPU ノード上の値で、エンドツーエンドの決済ではない」と明記されている ([Zama blog](https://www.zama.org/post/1000-tps-confidential-transfers-gpu-zama-protocol))。実際の待ちは、公開復号フローの構造が決める。コントラクトが `makePubliclyDecryptable` を呼び、その確定後にクライアントが relayer/KMS から平文と証明を取得し、`checkSignatures` で検証するトランザクションを送る ([Zama docs](https://docs.zama.org/protocol/solidity-guides/smart-contract/oracle))。公式文書にこの往復の秒数は書かれていない。調査者の推定では最低 3〜4 ステップのチェーン確定が必要で、mainnet では数十秒以上になりうる。Sepolia と mainnet の実測は未実施である。

この遅延を欠点でなく体験にするには、ラウンドを「リアルタイム」ではなく「締切のある非同期」にする。たとえば 1 ラウンドを数分〜数時間の窓にし、締切までは暗号化した選択を何度でも変更でき、締切後の開票待ちを演出に充てる。Fhenix 自身も FHE は遅延があるため時間制約の緩い戦略・カジノ系に向くと述べている ([Fhenix blog](https://www.fhenix.io/blog/trustless-gaming-not-all-is-fair-play))（2023 年、古い可能性）。同じ発想は日本のモバイルゲームでも馴染みがある。育成の待機、レース結果の観戦、ガチャの開示演出である。乱数ゲームの快感の中心は「結果の開示を待つ瞬間」にあるという整理も、今回のカタログ調査から導ける。ただしニアミス演出は覚醒を高めるが害にも転じうるため ([GuruGamer](https://gurugamer.com/reviews/same-machine-different-skin-what-gacha-pulls-and-slot-reels-have-in-common-27099))、「開票のタメ」は使っても、ニアミス加工は避けるのが妥当である。

HCU の観点では、少数派の集計は euint8 の加算と select 中心に設計すれば安価である。euint8 の add は 84k/88k、select は 55k HCU、euint64 の mul は 365k/596k HCU、euint128 の mul は 696k/1.69M HCU と型が大きいほど重い ([HCU docs](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu.md))。2 人の比較＋勝敗 select は数十万 HCU 程度で 20M/tx に収まると見積もれるが、これは実測ではなくコスト表からの推定である。

## キャラ育成と収集に載せるが、金銭リスクは別枠で扱う

オーナーが好むゲームの熱量は、キャラクター・育成・収集にある。日本のモバイルプレイヤーは「キャラクター(77%)」と「使いやすさ(73%)」を最重要と答え ([Automaton](https://automaton-media.com/en/news/japans-gacha-game-market-collapse-is-near-japanese-media-reports-but-is-the-market-simply-streamlining/))、収集は最大の課金動機で、ウマ娘は女性が 75% 超、長期継続はコンテンツの深度と更新頻度に依存すると分析されている ([FoxData](https://foxdata.com/en/blogs/anime-mobile-game-shift-from-female-driven-growth-to-immersive-content-and-long-term-engagement/))。ウマ娘は 2025 年 1 月時点で累計 2,200 万 DL 超 ([Game*Spark](https://www.gamespark.jp/article/2025/11/14/159493.html))。一方で日本のガチャ系の 70% 超が 3 年以内に終了したという報道もあり ([Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/japans-gacha-game-bubble-bursts-as-most-titles-die-within-3-years))（二次情報）、更新を継続できる体制が前提になる。パズドラ、パワプロ、シンデレラガールズ自体の D1/D7/D30 リテンションや仕様は取得できず、これらを「手本」とする判断は定量根拠を欠く。

規制面では、日本は 2012 年にコンプガチャを違法化した一方、通常の有料ランダム抽選は許容されている ([GamesBeat](https://gamesbeat.com/complete-gacha-illegal/))。確率の虚偽表示は景表法の優良誤認で措置命令の対象となる（FFBE 幻影戦争の事例）([gamebiz](https://gamebiz.jp/news/299384))。韓国は 2024 年 3 月に確率開示を法定化し、2025 年 8 月から最大 3 倍の懲罰的損害賠償を導入した ([Inven Global](https://www.invenglobal.com/articles/20244/loot-box-crackdown-south-korea-eyes-revenue-penalties-for-probability-disclosure-breaches))。ブラジルは 2026 年 3 月から未成年がアクセスできるゲームでの有料ランダム報酬を禁止した ([PC Gamer](https://www.pcgamer.com/gaming-industry/brazils-president-has-signed-a-ban-on-selling-loot-boxes-to-minors-as-part-of-a-larger-online-child-safety-law))。EU は 2026 年 11 月にデジタル公正法案を提示したと報じられ、未成年向けの賭博的ルートボックス禁止などが含まれるが、最終案は未確認である ([Gaming.net](https://www.gaming.net/european-commission-proposes-loot-box-and-virtual-currency-rules/))。ルートボックス支出と問題ギャンブルの関連も複数研究で報告されている ([GuruGamer](https://gurugamer.com/reviews/same-machine-different-skin-what-gacha-pulls-and-slot-reels-have-in-common-27099)、二次要約)。ここから言えるのは、FHE 乱数は「確率が表示どおりか」には効くが課金依存や未成年保護には効かず、むしろ「公平だから安心して使いすぎる」リスクがある（調査者の推論）。賭博該当性は法域ごとに別途確認が必要で、本報告は法的助言ではない。

人気オンチェーンゲームの教訓も同じ方向を示す。Axie Infinity の DAU は 2021 年 11 月の約 270 万から 2022 年 3 月に約 150 万へ落ち ([Naavik](https://naavik.co/deep-dives/axie-infinity-part-2/), [Blockworks](https://www.blockworks.com/news/axie-infinity-active-users-nft-prices-continue-to-decline-after-bridge-reopening))、Fantasy Top は約 34,000 ユーザー・手数料 $10.6M 超を記録した後に指標が大きく低下した ([The Block](https://www.theblock.co/amp/post/293128/fantasy-top-and-pump-fun-break-into-top-ten-crypto-protocols-by-fees-generated), [The Defiant](https://thedefiant.io/fantasy-top-mounts-a-comeback-with-tactics-v2))。Dark Forest（ZK 隠し情報ゲーム）は最大でも約 1,900 人（ホワイトリスト）規模にとどまった ([AltLayer docs](https://docs.altlayer.io/altlayer-documentation/flashlayer-showcase/dark-forest-community-round))。

## 有望な方向性の順位付き候補（調査者の評価）

以下の 4 案は、出典のある事実と調査者の判断を区別して書く。順位は「FHE の必然性」「大衆性」「実装リスク」「規制リスク」を総合した主観評価であり、市場やユーザーでの検証は未実施である。

### 第 1 位：少数派ラウンド連続戦と「読み癖」を持つキャラ育成

プレイヤーは育成キャラ（性格＝選択傾向、育成で「読みの精度」やサポート効果が成長）を編成し、毎ラウンド二択または複数選択肢を秘密提出する。少数派に入れば勝ちで、連勝ストリークや「少数派に入った回数」が称号やキャラ成長に反映される。FHE が必須なのは、N 人の暗号化選択を加算して少数側を select する集計と、賭け額・ポイント残高の秘匿である。commit-reveal では最後の公開者が放棄でき、サーバ集計では運営を信頼する必要がある。待ち時間は、毎ラウンドの締切までの編成時間、複数ラウンドの並列提出、開票時の演出（「今回は何割が右を選んだか」の発表）に置き換える。根拠は、Minority Game/少数決の構造適合度 5（調査者評価）、日本のモバイル層がキャラ・育成を重視する調査 ([Automaton](https://automaton-media.com/en/news/japans-gacha-game-market-collapse-is-near-japanese-media-reports-but-is-the-market-simply-streamlining/))、および純粋な Minority Game は混合戦略 50% が均衡で「読み」の余地が小さいという弱点 ([Wikipedia](https://en.wikipedia.org/wiki/El_Farol_Bar_problem))。後者は、純粋な 2 択のままだと実力差が出ず飽きやすいことを意味するため、選択肢を 3〜5 個に増やす、前ラウンド履歴を見せる、キャラ特性で選択の重みを変えるなどで戦略の深さを足す必要がある（調査者の推定）。主なリスクは、Sybil・共謀（複数アカウントで少数側を調整）と、育成要素が課金に直結した場合の規制である。賭け金付きの賞金は賭博規制に触れうるため、公開版はゲーム内ポイントや非換金の通貨を基本とし、トークン報酬は法務確認後とする。

### 第 2 位：「平均の 2/3」型のデイリー共有ラウンド

毎日 1 回、全員が 0〜100 の数を秘密に選び、平均の 2/3 に最も近い人が勝つ。結果は全員共通で、Wordle のように共有できる。FHE が必須なのは、全員の入力を暗号文のまま平均し、最近接を比較する部分である。入力値が途中で漏れると後出しが有利になるため、サーバ集計では運営への信頼が必要になる。待ち時間は 24 時間単位の「毎日の締切」と、翌日朝の「昨日の結果」発表の楽しみに転換できる。根拠は、2/3 ゲームが 19,196 人規模の実験で成立している事実 ([Wikipedia](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average))と、繰り返しで平均が下がり勝者の模倣が学習を加速するという知見で、これは「自分の読みの精度が上がる」成長感の根拠になりうる（調査者の推論）。リスクは、収束後に目標が 0 付近に張り付いて面白さが落ちる点で、毎日ルール（係数 2/3 を 1/2 や 3/4 に変える、上限を変える）で回避するのが妥当である。賭け金なしのため規制リスクは最も低い。

### 第 3 位：秘匿配分（Blotto 型）の編成バトル

複数の戦場にポイント（兵力、体力、スタミナ）を秘密配分し、多く配分した戦場を取る。パズドラ的な編成の楽しさに近く、「戦場数・予算・キャラ特性」を変えることで無限にバリエーションを作れる。FHE が必須なのは、複数値の秘密配分を暗号文のまま比較して一括で勝敗を決める部分で、調査者の評価では FHE 適合度 4。Blotto は Borel が 1921 年に提案し、最適戦略は配分のランダム化が必要なことが解析されている ([Wikipedia](https://en.wikipedia.org/wiki/Blotto_game))。この「最適解が解析済み」という性質は、上級者が混合戦略に収束するため長期的に単調になる弱点でもある。待ち時間は、配分を考える時間と、戦場ごとの開票演出に使える。主なリスクは、比較演算が戦場数に比例してコストが増えること（euint8 の比較は 52k〜59k HCU）と、2 人対戦だと対戦相手の確保が課題になる点で、集団でのランキング戦にすれば緩和できる。

### 第 4 位：乱数は味付けに限定する「Sealed Dice」モジュール

独立した遊びではなく、上記 3 案に組み込む補助機能である。同点時の勝者決定、勝利時のキャラ成長値の揺らぎ、連敗時の救済（ピティ的な保証）に `FHE.randEbool` や `randEuintN` を使い、「運営にも見えない」「結果は演出前に確定している」と明示する。FHE が本当に必要な度合いは低く（調査者評価で 2〜3、VRF で代替可）、ゲームの核というよりブランド上の信頼訴求の位置づけになる。待ち時間は、育成結果の開示演出に置き換えられる。根拠は、Genshin 型のピティ（ハードピティ 90、50/50 保証）が「保証までの物語」としてフックになっていること ([Genshin Wiki](https://genshin-impact.fandom.com/wiki/Wish)、ただしコミュニティ検証値)。リスクは、乱数が選択結果を支配しすぎて戦略性が薄れることと、課金と結びつければガチャ規制の対象になること。調査者の設計案としては、乱数は 1〜2 要素に絞り、確率テーブルをコントラクトで公開・不変にし、課金とは切り離す。

## 残る調査ギャップと次の検証

最大の穴は、Sepolia と mainnet での公開復号の往復時間が実測されていないことである。公式ドキュメントには秒数の記載がなく、本報告の「数十秒〜」は推定にすぎない。mainnet の gas 価格での 1 ラウンド実コスト、現行の HCU 上限（per-block が 10,000,000 との記載もあるが旧名称の可能性）、Zama の対応チェーンの拡大や埋め込みウォレット＋ガススポンサーの公式サポート状況も未確認である。リテンションについても、パズドラ・パワプロ・ウマ娘・シンデレラガールズの D1/D7/D30 値や仕様は一次資料を取得できず、「手本」としての有効性は定性的な整理に留まる。同時選択系のモバイルヒット作で定量データ付きのものも特定できなかった。

規制面でも、日本の 2025〜2026 年のガチャ個別措置命令や相談件数、韓国・EU の最終法文、パチンコ・パチスロの扱いは未確認である。Fantasy Top・Gods Unchained の最新ユーザー数、Inco・Sunscreen・Mind Network のゲーム事例、Zama Season 4/5 のゲーム勝者の具体名も未調査である。技術面では、commit-reveal と FHE のコスト・UX の定量比較、復号の戦略的放棄への対策（タイムアウトでの公開復号など）、`randEuint` を非 2 冪の範囲に落とす際のモジュロバイアスの扱いも未検証である。本報告のスコアはすべて調査者の主観で、ユーザーテストや競合実績に基づいていない。

## Conclusion

調査から見えた最も重要な転換は、「FHE が必要か」という問いの答えが、乱数ではなく**集計**にあったという点である。1 人用の運試しや 2 人の読み合いは FHE なしで成立するが、N 人が同時に秘密を出し、結果だけを公開して精算するという構造（少数決、2/3 ゲーム、Blotto）は、commit-reveal の放棄問題やサーバ集計の信頼問題を FHE が構造的に解消する領域に入る。Minority Rush は名前どおりその中心にいる。

次の一手は、遊びとしての熱中度の検証である。純粋な少数派ゲームは均衡が 50% の混合戦略になり読みの余地が小さいため、キャラ育成・選択肢の拡張・デイリー版の変化といった「深さ」を足さないと、オンチェーン経済崩壊型の失速と同じ道をたどるおそれがある。まず Sepolia で 1 ラウンドの往復時間を実測し、ポイント制の第 1 位案を小規模公開して、継続率と待ち時間への反応を測るのが最も情報価値の高い検証である。
