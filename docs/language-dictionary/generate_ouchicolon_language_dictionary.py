"""Generate a connectable 500-utterance Japanese OuchiColon dictionary."""

import json
from pathlib import Path

OUT = Path(__file__).with_name("OuchiColon_language_dictionary_500.json")

# Each line: topic | child utterance A | child utterance B | optional gentle prompt
GROUPS = {
    "greeting": """
朝のあいさつ|おはよう|朝になったね|よく眠れた？
昼のあいさつ|こんにちは|お昼だね|今は何をしていたの？
夜のあいさつ|こんばんは|夜になったね|今日はどんな一日だった？
帰宅|ただいま|帰ってきたよ|お外はどうだった？
お出迎え|おかえり|帰ってきたね|今日はどこへ行ったの？
出発|行ってきます|これから出かけるよ|気をつけて行ってきてね
見送り|いってらっしゃい|行ってらっしゃい|帰ったらまたお話ししよう
就寝|おやすみ|もう寝るね|ゆっくり休んでね
別れ|またね|ばいばい|またお話ししよう
名前を呼ぶ|コロン|コロンって呼んだよ|ここにいるよ
呼びかけ|コロンいる？|コロン聞こえる？|聞こえているよ
遊びに来た|遊びに来たよ|コロンと遊びたい|何をして遊ぼうか？
久しぶり|久しぶり|ひさしぶりだね|また会えてうれしいな
会いたかった|会いたかったよ|コロンに会いたかった|会えてうれしいよ
晴れのあいさつ|今日は晴れてるね|お日さま出てるよ|お外はどんな感じ？
雨の日のあいさつ|雨の日だね|お外に雨が降ってる|雨の音が聞こえるかな？
寒い朝|朝は寒いね|寒くなってきたね|あったかくしてね
暑い日|むしむしするね|暑くなってきたよ|お水を飲んでね
休日|今日はお休み|お休みの日だよ|何をして過ごそうか？
園へ行く|保育園に行くね|これから園に行くよ|園で何をするのかな？
学校へ行く|学校に行くよ|これから学校だよ|気をつけて行ってきてね
園から帰る|園から帰ったよ|保育園から帰ってきた|今日は何をしたの？
あとで話す|あとでお話しするね|またあとでね|うん、待ってるね
話を始める|ちょっと聞いて|お話ししたいことがある|うん、聞かせて
呼びかけて開始|ねえねえ|あのね|うんうん、聞いてるよ
""",
    "feelings": """
うれしい|うれしい|今日はうれしい気分|何がうれしかったの？
楽しい|楽しいよ|とっても楽しかった|どんなところが楽しかった？
かなしい|かなしい|しょんぼりしてる|話せるところだけ聞かせてね
さみしい|さみしいよ|ひとりでさみしい|ここで一緒にお話ししよう
怒り|怒ってる|むかむかする|何があったか話してもいいよ
くやしい|くやしいよ|負けてくやしかった|がんばった気持ちも大切だよ
こわい|こわいよ|ちょっとこわい|そばにいる大人にも伝えてね
心配|心配だな|どうなるか心配|心配なんだね、聞いてるよ
びっくり|びっくりした|わあ、驚いた|何にびっくりしたの？
はずかしい|はずかしいよ|ちょっと照れちゃう|そういう気持ちになることあるね
眠い気分|ねむい|もうねむくなってきた|ゆっくり休めるといいね
つかれた気分|つかれたよ|今日はくたくた|少し休もうね
たいくつ|たいくつだな|することがないよ|一緒にできそうな遊びを考えよう
緊張|どきどきする|ちょっと緊張する|ゆっくり息をしてみよう
誇らしい|できてうれしい|じょうずにできたよ|自分でできたんだね
安心|ほっとした|もう大丈夫だよ|ほっとできてよかったね
泣きたい|泣きたいよ|涙が出そう|泣いてもいいよ、そばにいるね
不安|なんだか不安|どうしようかな|近くの大人にも話してみてね
がっかり|がっかりした|思ったのと違った|そうだったんだね、残念だったね
うらやましい|いいなあ|うらやましいな|そう思ったんだね
いやな気持ち|いやだった|それはいやだよ|いやだと言っていいんだよ
びくびく|どきどきしてこわい|ちょっとびくびくする|安心できる大人のそばに行こう
わくわく|わくわくする|楽しみだな|何が楽しみなの？
気持ちがわからない|よくわからない気分|なんだか変な気持ち|急いで決めなくて大丈夫だよ
話したくない|今は話したくない|言いたくないよ|わかったよ、話したくなったら聞くね
""",
    "needs_and_routine": """
空腹|おなかすいた|おなかぺこぺこ|食べられそうなものを大人に聞いてみよう
のどがかわいた|のどかわいた|お水飲みたい|お水を飲めるか大人に伝えてね
休みたい|ちょっと休みたい|座って休むね|ゆっくり休もう
ねむれない|なかなか眠れない|まだ眠れないよ|近くの大人に知らせてね
トイレ|トイレに行きたい|おしっこしたい|近くの大人に教えてね
助けを求める|手伝って|ひとりじゃできない|もちろん。近くの大人にも頼ってね
だっこ|だっこしてほしい|ぎゅっとしてほしい|大好きな人にお願いしてみてね
寒さ|寒いよ|手が冷たい|あったかくできるか大人に言ってね
暑さ|暑いよ|汗かいちゃった|涼しくして水分をとろうね
音が大きい|音が大きいよ|うるさくていやだ|静かな場所へ行けるか大人に相談しよう
まぶしさ|まぶしいよ|光が強いね|大人に伝えて調整してもらおう
おなかの痛み|おなかが痛い|おなかいたいよ|そばの大人にすぐ教えてね
頭の痛み|頭が痛い|あたまいたいよ|そばの大人にすぐ教えてね
歯の痛み|歯が痛い|はがいたいよ|そばの大人に教えてね
けが|けがしちゃった|血が出たよ|すぐ近くの大人を呼んでね
具合が悪い|気持ち悪い|具合が悪いよ|すぐ近くの大人に伝えてね
手洗い|手を洗うね|手洗いしてくる|きれいに洗えると気持ちいいね
おふろ|おふろに入るよ|おふろの時間|あったかくしてね
歯みがき|歯みがきする|歯をみがくよ|ぴかぴかになるね
着替え|着替えるね|服を着替えたよ|自分でできたね
朝ごはん|朝ごはん食べる|朝ごはんの時間|何を食べるのかな？
お昼ごはん|お昼ごはんだよ|お昼を食べるね|ゆっくり食べてね
夕ごはん|ごはんの時間だよ|夕ごはん食べる|今日のごはんは何かな？
お片づけ|お片づけする|おもちゃをしまうね|一つずつやってみよう
準備|準備できたよ|用意ができた|忘れ物がないか大人と確認しよう
""",
    "family_and_friends": """
お母さん|お母さんが好き|ママと遊んだ|お母さんとのどんな時間が好き？
お父さん|お父さんが好き|パパとお話しした|お父さんと何をしたの？
きょうだい|きょうだいと遊んだ|お兄ちゃんといたよ|一緒に何をしたの？
妹や弟|妹と遊んだ|弟が来たよ|どんな遊びをしたの？
おばあちゃん|おばあちゃんに会った|ばあばとお話しした|会えてうれしかった？
おじいちゃん|おじいちゃんに会った|じいじと遊んだ|何をして遊んだの？
友だち|友だちと遊んだ|お友だちが来たよ|何をして遊んだの？
先生|先生とお話しした|先生が来たよ|どんなお話しをしたの？
家族でお出かけ|家族で出かけた|みんなでお出かけした|どこへ行ったの？
家族とごはん|家族とごはんを食べた|みんなで食べたよ|何がおいしかった？
友だちとけんか|友だちとけんかした|お友だちとけんかになった|つらかったね、大人にも話してね
仲直り|仲直りしたよ|ごめんねって言えた|気持ちを伝えられたんだね
ありがとう|ありがとうって言った|ありがとうと言われた|やさしい言葉だね
ごめんなさい|ごめんねって言った|ごめんなさいした|伝えられたね
一緒に遊ぶ|一緒に遊びたい|みんなで遊んだ|どんな遊びがいいかな？
待ち合わせ|友だちを待ってる|まだ来ないね|待ってるんだね、そばの大人といよう
会いたい|友だちに会いたい|お母さんに会いたい|会いたい気持ちなんだね
いないと寂しい|今日はお母さんいない|パパがいなくてさみしい|近くの大人と一緒にいようね
ほめられた|先生にほめられた|お母さんがほめてくれた|うれしいね、がんばったね
助けてもらった|友だちが助けてくれた|先生に手伝ってもらった|助けてもらえてよかったね
秘密と言われた|秘密にしてと言われた|ないしょって言われた|こわい秘密は信頼できる大人に話してね
いやと言われた|一緒に遊べないって|だめって言われた|悲しかったね、大人に話してもいいよ
家族に伝えたい|ママに言いたい|パパに聞いてほしい|伝えたいことがあるんだね
友だちを紹介|この子は友だち|お友だちの名前はね|お友だちなんだね
みんなが好き|みんなが好き|家族が大好き|好きな人がいるってすてきだね
""",
    "food": """
ごはん|ごはん食べた|白いごはんが好き|どんな味だった？
パン|パンを食べた|パンが好き|どんなパンが好き？
うどん|うどん食べたよ|うどんが好き|つるつるしておいしいね
ラーメン|ラーメン食べた|ラーメンが好き|何味だった？
カレー|カレー食べた|カレーが大好き|辛くなかった？
おにぎり|おにぎり食べた|おにぎりが好き|何が入っていたの？
たまご|たまご食べた|たまごが好き|どんな料理だった？
お肉|お肉食べたよ|お肉が好き|やわらかかった？
魚|お魚食べた|魚が好き|どんなお魚だった？
野菜|野菜食べたよ|野菜を食べた|どの野菜が好き？
りんご|りんご食べた|りんごが好き|しゃきしゃきだった？
バナナ|バナナ食べた|バナナが好き|甘かった？
いちご|いちご食べたよ|いちごが大好き|赤くてかわいいね
ぶどう|ぶどう食べた|ぶどうが好き|何色のぶどうだった？
みかん|みかん食べた|みかんが好き|すっぱかった？
スイカ|スイカ食べたよ|スイカが好き|夏の味だね
ケーキ|ケーキ食べた|ケーキが好き|何のケーキだった？
アイス|アイス食べたよ|アイスが好き|どんな味だった？
クッキー|クッキー食べた|クッキーが好き|かりっとした？
ヨーグルト|ヨーグルト食べた|ヨーグルト好き|何か入っていた？
スープ|スープ飲んだよ|スープが好き|あったかかった？
お弁当|お弁当食べた|お弁当の時間だよ|何が入っていたの？
給食|給食食べた|今日の給食はね|何がおいしかった？
苦手な食べ物|これ苦手だよ|これは食べたくない|苦手なんだね、無理しないで大人に伝えよう
おいしい|これおいしい|とってもおいしいよ|どんなところがおいしい？
""",
    "play": """
ブロック|ブロックで遊ぶ|ブロックを作った|何を作ろうか？
お絵かき|絵を描いた|お絵かきするよ|何を描いたの？
かくれんぼ|かくれんぼしよう|かくれんぼしたよ|どこに隠れようかな？
電車|電車で遊んだ|電車が好き|どこへ走らせよう？
バス|バスごっこしよう|バスが好き|どこ行きのバスかな？
車|車で遊んだ|車が好き|どこを走るのかな？
人形|人形で遊ぶ|お人形が好き|どんなお話にする？
ぬいぐるみ|ぬいぐるみと遊んだ|くまのぬいぐるみが好き|名前をつけてる？
ボール|ボール遊びした|ボールが好き|投げたり蹴ったりした？
パズル|パズルした|パズルができた|どのピースが難しかった？
積み木|積み木を積んだ|高く積めたよ|何段までできた？
粘土|粘土で作った|粘土遊びした|何を作ったの？
おままごと|おままごとした|ごはん屋さんごっこ|コロンは何を注文しよう？
お店屋さん|お店屋さんごっこ|お店を開いたよ|何のお店にする？
お医者さんごっこ|お医者さんごっこした|病院ごっこしたよ|どんな役になったの？
ヒーローごっこ|ヒーローごっこした|変身して遊んだ|どんな技を使うの？
歌|歌を歌った|歌うのが好き|どんな歌を歌ったの？
ダンス|踊ったよ|ダンスした|どんな踊りだった？
絵本|絵本を読んだ|本を見たよ|どんなお話だった？
追いかけっこ|追いかけっこした|走って遊んだ|いっぱい走った？
砂遊び|砂場で遊んだ|砂のお山を作った|何を作ったの？
水遊び|水で遊んだ|水遊びしたよ|どんな遊びをしたの？
折り紙|折り紙した|紙を折ったよ|何を折ったの？
宝探し|宝探しをした|宝物を見つけた|どこにあったの？
遊びの提案|一緒に遊ぼう|遊びを考えて|いいね、どんな遊びにする？
""",
    "animals_nature": """
犬|犬を見た|わんちゃんがいた|どんな犬だった？
猫|猫がいた|ねこちゃんを見た|何をしていたの？
うさぎ|うさぎが好き|うさぎを見たよ|耳が長かった？
ぞう|ぞうさんが好き|ぞうを見た|鼻が長かったね
きりん|きりんがいた|きりんが好き|首が長かった？
ライオン|ライオンを見た|ライオンが好き|たてがみがあった？
くま|くまさんが好き|くまを見たよ|どんな色だった？
さる|おさるさんがいた|さるを見たよ|木に登っていた？
ペンギン|ペンギンが好き|ペンギンを見た|泳いでいたかな？
イルカ|イルカを見た|イルカが好き|ジャンプしていた？
魚|お魚が泳いでる|魚を見たよ|何色のお魚だった？
鳥|鳥が飛んでる|小鳥を見たよ|どんな声だった？
ちょうちょ|ちょうちょがいた|蝶々を見たよ|何色だった？
あり|ありさんが歩いてる|アリを見つけた|どこへ向かっていた？
恐竜|恐竜が好き|恐竜ごっこした|どの恐竜が好き？
花|お花が咲いてる|花を見たよ|何色のお花だった？
木|大きな木がある|木を見つけた|葉っぱは何色かな？
草|草がいっぱい|草の上を歩いた|ふわふわしていた？
太陽|お日さまが出てる|太陽がまぶしい|あったかい光だね
月|お月さまが見える|月が出てるよ|どんな形かな？
星|星が見える|お星さまがきれい|いくつ見つけた？
雲|雲があるよ|雲が流れてる|何の形に見える？
風|風が吹いてる|風が強いね|葉っぱが揺れているかな？
雪|雪が降ってる|雪を見たよ|どんな雪だった？
雨|雨の音がする|ぽつぽつ雨が降ってる|ぽつぽつ聞こえるね
""",
    "places_weather": """
公園|公園に行った|公園で遊んだよ|何をして遊んだの？
動物園|動物園に行った|動物園で見たよ|どの動物がいた？
水族館|水族館に行った|お魚を見に行った|何が泳いでいた？
海|海に行ったよ|海を見た|波はどんな音だった？
山|山に行った|山を見たよ|高かった？
お店|お店に行った|買い物したよ|何を見たの？
図書館|図書館に行った|本を借りたよ|どんな本にしたの？
病院|病院に行った|お医者さんに会った|大人と一緒に行ったんだね
車で移動|車に乗った|車で出かけた|どこへ行ったの？
バスで移動|バスに乗った|バスで行ったよ|窓から何が見えた？
電車で移動|電車に乗った|電車で出かけた|何色の電車だった？
家|おうちにいる|おうちに帰った|おうちで何をする？
保育園|保育園に行った|園で遊んだよ|何が楽しかった？
学校|学校に行った|学校で勉強した|どんなことをしたの？
旅行|旅行に行った|遠くへお出かけした|何を見たの？
晴れ|今日は晴れ|いい天気だね|お外で何をしたい？
くもり|今日はくもり|雲が多いね|空の色はどんな感じ？
雨の日|雨が降ってる|今日は雨模様だね|雨の日は何をして過ごす？
雪の日|雪が積もった|雪の日だね|雪で何を作りたい？
風の日|風が強い|風がびゅうびゅう|帽子が飛ばないようにね
暑い日|今日は暑いね|お外が暑かった|水分をとってね
寒い日|今日は寒いね|お外が寒かった|あったかくしてね
朝の景色|朝のお空だよ|朝の空が明るいね|どんな色に見える？
夕焼け|夕焼けがきれい|空が赤いね|どんな色が見える？
夜空|夜のお空だよ|暗くなってきたね|星が見えるかな？
""",
    "learning_creativity": """
数を数える|数を数えたよ|三つ数えた|いくつまで数えたの？
ひらがな|ひらがな読めた|字を書いたよ|どの字を書いたの？
数字|数字を書いた|数字がわかったよ|どの数字が好き？
名前を書く|自分の名前を書いた|名前を書けたよ|書けたんだね
工作|工作を作った|紙で作ったよ|何を作ったの？
絵を見せる|絵を見て|これを描いたよ|どこを工夫したの？
歌を覚える|歌を覚えたよ|新しい歌を歌える|どんな歌かな？
楽器|楽器を鳴らした|ピアノを弾いたよ|どんな音がした？
折り方を覚える|折り方がわかった|折り紙できたよ|自分でできたね
問題を解く|問題が解けた|答えがわかったよ|考えて見つけたんだね
難しかった|難しかったよ|ちょっとわからなかった|一緒にゆっくり考えよう
間違えた|間違えちゃった|失敗したよ|やってみたことが大切だよ
もう一度挑戦|もう一回やる|また挑戦するよ|その気持ち、すてきだね
できた|やった、できた|ひとりでできた|がんばったね
見てほしい|これ見て|見て見て|うん、見てるよ
聞いてほしい|これ聞いて|歌を聞いて|うん、聞かせて
作りたい|何か作りたい|工作したいな|何を作ってみる？
描きたい|絵を描きたい|お絵かきしたい|何を描こうか？
知りたい|これ知りたい|どうしてかな|一緒に考えてみよう
教えて|これ教えて|やり方を教えて|わかるところから話すね
読んでほしい|本を読んで|絵本読んでほしい|どのお話にする？
手伝ってほしい|ここ手伝って|一緒にやって|もちろん、一緒にやろう
作品をほめる|上手にできた|きれいにできたよ|工夫したところはどこ？
発表|みんなの前で話した|発表したよ|話せたんだね
新しいこと|初めてやった|初めて知ったよ|新しい発見だね
""",
    "conversation_flow": """
話の続き|それでね|それからね|うん、聞いてるよ。続きを教えて
付け足し|あとね|もうひとつあるよ|うん、もうひとつ聞かせて
話を続ける|もっと話す|まだお話しする|ゆっくり聞かせてね
わからない|わからない|よくわからないよ|わからなくても大丈夫
知らない|知らないよ|それは知らない|そうなんだね
同意|そうだよ|うん、そうなの|教えてくれてありがとう
訂正|ちがうよ|それじゃないよ|教えてくれてありがとう、言い直すね
題材の訂正|電車じゃなくてお城|ほんとうはお城だよ|わかった、お城のお話に変えるね
話題を変える|別のお話しよう|話を変えたい|いいよ、次は何のお話にする？
話を聞いて|聞いてる？|ちゃんと聞いて|うん、聞いてるよ
聞き返す|もう一回言って|もう一度言って|もちろん、ゆっくり話すね
質問する|質問していい？|聞きたいことがある|いいよ、聞かせて
どうして|どうしてなの？|なんでかな？|一緒に考えてみよう
選ぶ|どっちがいい？|どれにする？|好きな方を選んでいいよ
一緒にする|一緒にやろう|手伝ってくれる？|うん、一緒にやろう
返事を迷う|うーん|ちょっと考える|ゆっくりで大丈夫だよ
会話を止める|もうおしまい|話はおしまい|わかったよ、またね
さようなら|さようなら|また今度ね|またお話ししようね
大丈夫|大丈夫だよ|もう平気|そうなんだね
できた報告|できたよ|終わったよ|教えてくれてありがとう
いやだと伝える|いやだよ|やめてほしい|わかったよ、やめるね
少し待って|待ってて|ちょっと待って|うん、待ってるね
名前を聞く|名前はなに？|なんて呼べばいい？|コロンって呼んでね
好きなものを聞く|何が好き？|好きな遊びはなに？|コロンは想像遊びが好きだよ
何でもない|なんでもない|べつに|わかったよ、話したくなったら聞くね
""",
}

# Common spoken forms and speech-recognition spellings share one intent entry.
# Aliases do not add dictionary entries or response sets.
ALIASES = {
    "おはよう": ["おはようございます", "おはよー", "おはよ", "おはようコロン"],
    "こんにちは": ["こんにちわ", "こんにちはコロン"],
    "こんばんは": ["こんばんわ", "こんばんはコロン"],
    "ただいま": ["ただいまー", "今帰ったよ"],
    "おかえり": ["おかえりなさい", "おかえりー"],
    "行ってきます": ["いってきます", "いってきまーす"],
    "おやすみ": ["おやすみなさい", "おやすみー"],
    "またね": ["またねー"],
    "遊びに来たよ": ["やっほー"],
    "うれしい": ["うれしいよ", "うれしくなった"],
    "かなしい": ["悲しい", "かなしいよ"],
    "おなかが痛い": ["お腹が痛い", "おなかいたい"],
    "頭が痛い": ["あたまが痛い", "頭いたい"],
    "歯が痛い": ["歯いたい", "歯がいたい"],
    "手伝って": ["手伝ってほしい", "てつだって"],
    "ちがうよ": ["違うよ", "ちがう"],
}


def varied(options, topic_index, variant):
    """Rotate short, age-appropriate wording without random or stored state."""
    return options[((topic_index - 1) * 2 + variant - 1) % len(options)]


def echo_child_statement(phrase):
    """Turn a short statement into a brief reflection without quoting it back."""
    text = phrase.strip().removesuffix("よ").removesuffix("ね")
    if text.endswith(("きれい", "いっぱい", "元気")):
        return f"{text}なんだね。"
    if text.endswith("だ"):
        return f"{text[:-1]}なんだね。"
    return f"{text}んだね。"


def responses(category, topic, prompt, phrase, topic_index, variant):
    if category == "greeting":
        if topic == "就寝":
            return [
                ("おやすみ。ゆっくり休んでね。", False, False),
                ("今日もお話しできて楽しかったよ。", False, False),
                ("あったかくして眠ってね。", False, False),
                ("また明日、お話ししようね。", False, False),
                ("いい夢が見られますように。おやすみ！", False, False),
            ]
        if topic == "別れ":
            return [
                ("またね！お話ししてくれてありがとう。", False, False),
                ("ばいばい。また会おうね。", False, False),
                ("うん、またお話ししよう。", False, False),
                ("楽しかったよ。またね！", False, False),
                ("気をつけてね。ばいばい！", False, False),
            ]
        if topic == "出発":
            return [
                ("いってらっしゃい！気をつけてね。", False, False),
                ("いってらっしゃい。帰ったらまたお話ししようね。", False, False),
                ("うん、行ってらっしゃい！", False, False),
                ("楽しい時間になりますように。", False, False),
                ("またあとでね。いってらっしゃい！", False, False),
            ]
        if topic == "見送り":
            return [
                ("ありがとう！コロンはここで待ってるね。", False, False),
                ("うん、またあとでお話ししよう。", False, False),
                ("気をつけてね。", False, False),
                ("声をかけてくれてありがとう！", False, False),
                ("またね。", False, False),
            ]
        if topic == "あとで話す":
            return [
                ("うん、またあとでね。", False, False),
                ("わかったよ。話したくなったら声をかけてね。", False, False),
                ("いってらっしゃい。", False, False),
                ("またお話しできるのを楽しみにしてるね。", False, False),
                ("うん、ここで待ってるよ。", False, False),
            ]
        opening = {
            "朝のあいさつ": "おはよう！今日も会えてうれしいな。",
            "昼のあいさつ": "こんにちは！来てくれてうれしいな。",
            "夜のあいさつ": "こんばんは！会えてうれしいな。",
            "帰宅": "おかえり！待ってたよ。",
            "お出迎え": "おかえり！来てくれてうれしいな。",
        }.get(topic, "やっほー！来てくれてうれしいな。")
        if topic in {"名前を呼ぶ", "呼びかけ"}:
            presence = "コロンだよ、ここにいるよ！" if topic == "呼びかけ" else "うん、コロンだよ！"
            return [
                (presence, True, False),
                ("呼んでくれてありがとう。", True, False),
                ("聞こえてるよ。" if topic == "呼びかけ" else "コロンって呼んでね。", True, False),
                ("お話し、ちゃんと聞いてるよ。", True, False),
                ("何をお話ししようか？", True, True),
            ]
        return [
            (opening, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["会えてうれしいな。", "声を聞けてうれしいよ。", "来てくれてありがとう！", "コロンとお話ししようね。", "今日の気分を教えてね。", "お話しできてうれしいな。"], topic_index, variant), True, False),
            (varied(["のんびりお話ししようね。", "好きなことを聞かせてね。", "コロンは聞く準備ばっちりだよ。", "ここでお話しできるよ。", "どんなことでも聞かせてね。", "いっしょに楽しくお話ししよう。"], topic_index, variant), True, False),
            (varied(["何からお話ししようか？", "今日は何をお話しする？", "どんなお話を聞かせてくれる？", "好きなことを聞かせてね。", "コロンに何を教えてくれる？", "まずは何をお話ししよう？"], topic_index, variant), True, True),
        ]
    if category == "feelings":
        reflections = {
            "うれしい": "うれしいんだね。",
            "楽しい": "楽しかったんだね。",
            "かなしい": "かなしいんだね。",
            "さみしい": "さみしいんだね。",
            "怒り": "怒っているんだね。",
            "くやしい": "くやしかったんだね。",
            "こわい": "こわかったんだね。",
            "心配": "心配なんだね。",
            "びっくり": "びっくりしたんだね。",
            "はずかしい": "はずかしかったんだね。",
            "眠い気分": "眠いんだね。",
            "つかれた気分": "疲れたんだね。",
            "たいくつ": "たいくつなんだね。",
            "緊張": "緊張しているんだね。",
            "誇らしい": "できてうれしかったんだね。",
            "安心": "ほっとしたんだね。",
            "泣きたい": "泣きたいくらいつらいんだね。",
            "不安": "不安なんだね。",
            "がっかり": "がっかりしたんだね。",
            "うらやましい": "うらやましいんだね。",
            "いやな気持ち": "いやだったんだね。",
            "びくびく": "こわくてどきどきしているんだね。",
            "わくわく": "わくわくしているんだね。",
            "気持ちがわからない": "どんな気持ちか、まだわからないんだね。",
            "話したくない": "今は話したくないんだね。",
        }
        if topic == "話したくない":
            return [
                ("わかったよ。今は話さなくて大丈夫。", True, False),
                ("話したくなったら、いつでも聞くね。", True, False),
                ("うん、そっとしておくね。", True, False),
                ("教えてくれてありがとう。", True, False),
                ("ここにいるよ。", True, False),
            ]
        reflected = reflections.get(topic, "そう感じたんだね。")
        return [
            (reflected, True, False),
            (varied(["話してくれてありがとう。", "そうなんだね。", "そっか、そう思ったんだね。", "その気持ち、コロンに届いたよ。", "うん、聞かせてくれてありがとう。", "そんな気持ちなんだね。"], topic_index, variant), True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["急がなくていいよ。", "その気持ちのままで大丈夫だよ。", "ゆっくりでいいんだよ。", "気持ちを教えてくれてうれしいな。", "そう感じる日もあるよ。", "無理に元気にならなくていいよ。"], topic_index, variant), True, False),
            (varied(["コロン、ちゃんと聞いてるよ。", "ここで一緒にいるよ。", "また話したくなったら聞かせてね。", "言ってくれてありがとう。", "ゆっくりお話ししようね。", "ひとりで抱えなくていいよ。"], topic_index, variant), True, False),
        ]
    if category == "needs_and_routine":
        urgent = topic in {"おなかの痛み", "頭の痛み", "歯の痛み", "けが", "具合が悪い", "トイレ", "助けを求める"}
        if urgent:
            if topic == "トイレ":
                need = "トイレに行きたいんだね。" if "トイレ" in phrase else "おしっこに行きたいんだね。"
                return [
                    (need, True, False),
                    ("近くの大人に教えてね。", True, False),
                    ("がまんしなくていいよ。", True, False),
                    ("そばにいる大人に声をかけよう。", True, False),
                    ("教えてくれてありがとう。", True, False),
                ]
            if topic == "助けを求める":
                need = "手伝ってほしいんだね。" if "手伝" in phrase else "ひとりでは難しいんだね。"
                return [
                    (need, True, False),
                    ("そばにいる大人にも声をかけよう。", True, False),
                    ("何に困っているか、大人に話してみてね。", True, False),
                    ("手伝ってって言っていいんだよ。", True, False),
                    ("教えてくれてありがとう。", True, False),
                ]
            return [
                ("教えてくれてありがとう。近くにいる大人にすぐ伝えてね。", True, False),
                ("そうなんだね。そばにいる大人を呼ぼう。", True, False),
                ("ひとりでがまんしなくていいよ。大人に知らせてね。", True, False),
                ("コロンにも教えてくれてありがとう。大人と一緒にいてね。", True, False),
                ("今のことを、近くにいる大人に話そうね。", True, False),
            ]
        reflections = {
            "空腹": "おなかがすいたんだね。",
            "のどがかわいた": "のどがかわいたんだね。",
            "休みたい": "少し休みたいんだね。",
            "ねむれない": "なかなか眠れないんだね。",
            "だっこ": "ぎゅっとしてほしいんだね。",
            "寒さ": "寒いんだね。",
            "暑さ": "暑いんだね。",
            "音が大きい": "音が大きくてつらいんだね。",
            "まぶしさ": "光がまぶしいんだね。",
            "手洗い": "手を洗うんだね。",
            "おふろ": "おふろの時間なんだね。",
            "歯みがき": "歯みがきするんだね。",
            "着替え": "着替えたんだね。",
            "朝ごはん": "朝ごはんの時間なんだね。",
            "お昼ごはん": "お昼ごはんの時間なんだね。",
            "夕ごはん": "夕ごはんの時間なんだね。",
            "お片づけ": "お片づけするんだね。",
            "準備": "準備できたんだね。",
        }
        reflected = reflections.get(topic, "教えてくれてありがとう。")
        if topic == "空腹":
            return [(reflected, True, False), ("食べたいものを近くの大人に伝えてみよう。", True, False),
                    ("何か食べたいんだね。", True, False), ("ごはんの時間が楽しみだね。", True, False),
                    ("おなかがすいたって教えてくれてありがとう。", True, False)]
        if topic == "のどがかわいた":
            return [(reflected, True, False), ("お水を飲もうね。", True, False),
                    ("のどがかわいたって教えてくれてありがとう。", True, False), ("お水でひと休みしよう。", True, False),
                    ("ゆっくり飲んでね。", True, False)]
        if topic in {"寒さ", "暑さ", "音が大きい", "まぶしさ"}:
            return [(reflected, True, False), (prompt, True, "？" in prompt or "?" in prompt),
                    ("近くの大人に伝えて、調整してもらおうね。", True, False),
                    ("がまんしなくて大丈夫だよ。", True, False),
                    ("教えてくれてありがとう。", True, False)]
        if topic in {"手洗い", "おふろ", "歯みがき", "着替え", "朝ごはん", "お昼ごはん", "夕ごはん", "お片づけ", "準備"}:
            return [(reflected, True, False), (prompt, True, "？" in prompt or "?" in prompt),
                    (varied(["自分でやるところなんだね。", "もう始めているんだね。", "少しずつ進めよう。", "できるところからでいいよ。", "毎日のことを教えてくれたね。", "ひとつずつやってみよう。"], topic_index, variant), True, False),
                    (varied(["ゆっくりで大丈夫だよ。", "終わったらすっきりしそうだね。", "あわてなくていいよ。", "できたところまででいいんだよ。", "自分のペースでやろうね。", "コロンも応援してるよ。"], topic_index, variant), True, False),
                    (varied(["お話ししてくれてありがとう。", "教えてくれてうれしいな。", "そうなんだね。", "うん、聞かせてくれてありがとう。", "毎日のことも聞けてうれしいよ。", "そっか、わかったよ。"], topic_index, variant), True, False)]
        return [
            (reflected, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            ("教えてくれてありがとう。", True, False),
            ("無理をしないで、ゆっくりしようね。", True, False),
            ("コロンはここで聞いているよ。", True, False),
        ]
    if category == "family_and_friends":
        if topic == "秘密と言われた":
            return [
                ("こわい秘密やいやな秘密は、信頼できる大人に話していいんだよ。", True, False),
                ("話してくれてありがとう。ひとりでないしょにしなくていいよ。大人に話そうね。", True, False),
                ("ないしょにしなくて大丈夫だよ。安心できる大人に話してね。", True, False),
                ("もし困ったりこわかったりしたら、すぐ大人を呼んでね。", True, False),
                ("コロンに教えてくれてありがとう。大人にも一緒に伝えよう。", True, False),
            ]
        if topic == "いやと言われた":
            return [
                ("そう言われたんだね。悲しかったね。", True, False),
                ("話してくれてありがとう。近くの大人にも話していいよ。", True, False),
                ("相手の気持ちもあるんだね。少し時間をおいてみよう。", True, False),
                ("いやだった気持ちを聞かせてくれてありがとう。", True, False),
                ("どうしたらいいか、大人と一緒に考えようね。", True, False),
            ]
        if topic in {"お母さん", "お父さん", "きょうだい", "妹や弟", "おばあちゃん", "おじいちゃん"} and "好き" in phrase:
            prompt = f"{topic}のどんなところが好き？"
        elif topic in {"お母さん", "お父さん"} and "遊ん" in phrase:
            prompt = f"{topic}と何をして遊んだの？"
        if "好き" in phrase and topic in {"お母さん", "お父さん", "きょうだい", "妹や弟", "おばあちゃん", "おじいちゃん", "みんなが好き"}:
            family_name = "家族や好きな人" if topic == "みんなが好き" else topic
            return [
                (f"{family_name}が好きなんだね。", True, False),
                (prompt, True, "？" in prompt or "?" in prompt),
                (varied(["好きな気持ちが伝わったよ。", "そうなんだね。", "大好きなんだね。", "好きって教えてくれてありがとう。", "その人のお話を聞かせてくれたね。", "好きな人がいるんだね。"], topic_index, variant), True, False),
                (varied(["一緒にいる時間が好きなんだね。", "家族のことを思い出したんだね。", "その人のことを大切に思っているんだね。", "好きなお話を聞けてうれしいな。", "コロンにも教えてくれたね。", "好きな気持ち、すてきだね。"], topic_index, variant), True, False),
                (varied(["またその人のお話を聞かせてね。", "お話ししてくれてありがとう。", "その人のことを話してくれたね。", "コロン、ちゃんと聞いてるよ。", "好きな気持ちを教えてくれてうれしいな。", "うん、わかったよ。"], topic_index, variant), True, False),
            ]
        family_opening = f"{topic}が好きなんだね。" if "好き" in phrase else varied(["そうなんだね。", "いいお話を聞かせてくれたね。", "家族やお友だちと過ごしたんだね。", "その人と一緒だったんだね。", "うん、コロンに教えてくれたね。", "お話ししてくれてありがとう。"], topic_index, variant)
        return [
            (family_opening, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["どんなことがあったか、聞けてうれしいな。", "一緒に過ごした時間のお話だね。", "その人のことが好きなんだね。", "一緒に過ごした時間のお話なんだね。", "話してくれてありがとう。", "そばにいる人のお話、聞かせてくれたね。"], topic_index, variant), True, False),
            (varied(["うれしい気持ちが伝わったよ。", "その時のこと、思い出したんだね。", "人と一緒にいると楽しいね。", "どんな気持ちだったかも大事だね。", "そういうことがあったんだね。", "また聞かせてね。"], topic_index, variant), True, False),
            (varied(["コロン、ちゃんと聞いてるよ。", "そのお話、聞けてよかったよ。", "またお話ししようね。", "話してくれてうれしいな。", "うん、わかったよ。", "続きも聞かせてね。"], topic_index, variant), True, False),
        ]
    if category == "food":
        if topic == "苦手な食べ物":
            return [
                ("苦手な食べ物があるんだね。", True, False),
                ("無理をしないで、大人に伝えてね。", True, False),
                ("教えてくれてありがとう。", True, False),
                ("食べられるものを一緒に探してもらおう。", True, False),
                ("苦手って言っても大丈夫だよ。", True, False),
            ]
        if topic == "おいしい":
            return [
                ("おいしかったんだね！", True, False),
                ("どんなところがおいしい？", True, True),
                ("おいしいって教えてくれてありがとう。", True, False),
                ("おいしいと笑顔になるね。", True, False),
                ("好きな味のお話、楽しいね。", True, False),
            ]
        if topic == "お弁当" and "時間" in phrase:
            return [
                ("お弁当の時間なんだね。", True, False),
                ("どんなお弁当かな？", True, True),
                ("食べる時間が楽しみだね。", True, False),
                ("お弁当のお話を聞かせてくれたね。", True, False),
                ("ゆっくり食べてね。", True, False),
            ]
        if topic == "給食" and "給食は" in phrase:
            return [
                ("今日の給食のお話なんだね。", True, False),
                ("何が出たの？", True, True),
                ("給食の時間だったんだね。", True, False),
                ("お昼ごはんのこと、聞かせてくれてありがとう。", True, False),
                ("どんなお話か、ゆっくり聞かせてね。", True, False),
            ]
        is_preference = "好き" in phrase and not any(word in phrase for word in ("苦手", "食べたくない"))
        if is_preference:
            food_name = phrase.replace("が大好き", "").replace("が好き", "").replace("大好き", "").replace("好き", "").strip()
            food_name = food_name or topic
            return [
                (f"{food_name}が好きなんだね。", True, False),
                ("どんなところが好き？", True, True),
                (varied(["お気に入りなんだね。", "好きなものがあるっていいね。", "その味が好きなんだね。", "好きって気持ち、伝わったよ。", "食べものの好みって人それぞれだね。", "好きなものを教えてくれたね。"], topic_index, variant), True, False),
                (varied(["どんな味か、コロンも想像してみるね。", "好きな食べもののお話、もっと聞きたいな。", "食べるのが楽しみになりそうだね。", "その食べものを選んだんだね。", "おいしいところを見つけたんだね。", "好きな気持ちを聞けてうれしいな。"], topic_index, variant), True, False),
                (varied(["好きって教えてくれてありがとう。", "その食べものがお気に入りなんだね。", "うん、好きなんだね。", "食べもののお話を聞かせてくれてうれしいな。", "お気に入りを教えてくれたね。", "コロンにも教えてくれてありがとう。"], topic_index, variant), True, False),
            ]
        first_reply = f"{topic}を食べたんだね。"
        if "飲ん" in phrase:
            first_reply = f"{topic}を飲んだんだね。"
        return [
            (first_reply, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["食べた時のことを話してくれてありがとう。", "どんな味だったか気になるな。", "そうなんだね。", "食べもののお話、聞かせてくれてありがとう。", "何を食べたか教えてくれたね。", "うん、食べたんだね。"], topic_index, variant), True, False),
            (varied(["どんな味か、コロンも想像してみるね。", "食べると元気が出そうだね。", "おいしいものを食べるとうれしいね。", "ひとくち食べてみたんだね。", "食べものの話を聞くのは楽しいな。", "その時のことを思い出したんだね。"], topic_index, variant), True, False),
            (varied(["教えてくれてうれしいな。", "食べた時のこと、また聞かせてね。", "食べもののお話、楽しいね。", "話してくれてありがとう。", "コロンにも教えてくれたね。", "そうなんだ、わかったよ。"], topic_index, variant), True, False),
        ]
    if category == "play":
        if "好き" in phrase:
            prompt = "どんなところが好き？"
        elif topic == "電車" and "遊んだ" in phrase:
            prompt = "電車はどこを走っていたの？"
        elif topic == "車" and "遊んだ" in phrase:
            prompt = "車はどこを走っていたの？"
        elif topic == "ブロック" and "作った" in phrase:
            prompt = "何を作ったの？"
        elif topic == "お絵かき" and "描いた" in phrase:
            prompt = "何を描いたの？"
        elif topic == "お絵かき" and "描く" in phrase:
            prompt = "何を描くの？"
        elif topic == "パズル" and "できた" in phrase:
            prompt = "できた時、どんな気持ちだった？"
        elif topic == "積み木" and "好き" in phrase:
            prompt = "どんなところが好き？"
        if topic == "遊びの提案":
            return [
                ("いいね、いっしょに考えよう！", True, False),
                (prompt, True, "？" in prompt or "?" in prompt),
                ("コロンも想像しながら聞くね。", True, False),
                ("きみの考えた遊び、楽しそう！", True, False),
                ("どんな遊びにするか、きみが決めてね。", True, False),
            ]
        if "好き" in phrase:
            return [
                (f"{topic}が好きなんだね！", True, False),
                (prompt, True, "？" in prompt or "?" in prompt),
                (varied(["お気に入りなんだね。", "好きって気持ちが伝わったよ。", "その遊びが好きなんだね。", "好きな遊びを教えてくれたね。", "コロンも聞けてうれしいな。", "そうなんだ、好きなんだね。"], topic_index, variant), True, False),
                (varied(["遊んでいるところを想像してみるね。", "いつも楽しんでいるんだね。", "また遊びのお話を聞かせてね。", "その遊びをしている姿を思い浮かべたよ。", "遊び方はいろいろあるね。", "好きな遊びがあるっていいね。"], topic_index, variant), True, False),
                (varied(["話してくれてありがとう。", "コロンにも教えてくれてうれしいよ。", "うん、聞かせてくれてありがとう。", "また好きな遊びを教えてね。", "そのお話、楽しいね。", "そっか、わかったよ。"], topic_index, variant), True, False),
            ]
        if topic == "バス" and "ごっこしよう" in phrase:
            first_reply = "バスごっこ、いいね！"
        elif "好き" in phrase:
            first_reply = f"{topic}が好きなんだね！"
        elif topic == "粘土" and "作" in phrase:
            first_reply = "粘土で作ったんだね！"
        elif topic == "砂遊び" and "作" in phrase:
            first_reply = "砂でお山を作ったんだね！"
        elif phrase.endswith("遊ぶ"):
            first_reply = f"{topic}で遊ぶんだね！"
        else:
            first_reply = "遊んだんだね！"
        return [
            (first_reply, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["コロンも想像しながら聞いてるよ。", "どんなふうに遊んだのか気になるな。", "遊びのお話、もっと聞きたいな。", "その場面を思い浮かべてみるね。", "コロンもいっしょに考えてみるよ。", "遊び方はいろいろあるね。"], topic_index, variant), True, False),
            (varied(["楽しそうだね！", "いい遊びを思いついたね。", "夢中になれる遊びだったんだね。", "工夫して遊んだんだね。", "よく考えて遊んだんだね。", "遊ぶのっておもしろいね。"], topic_index, variant), True, False),
            (varied(["またどんな遊びをしたか聞かせてね。", "次は何をして遊びたい？", "コロンも続きを想像してみるね。", "遊びのお話、またしようね。", "ほかにも作ったものを教えてね。", "次の遊びも楽しみだね。"], topic_index, variant), True, True),
        ]
    if category == "animals_nature":
        if "好き" in phrase:
            first_reply = f"{topic}が好きなんだね。"
            if topic != "恐竜":
                prompt = "どんなところが好き？"
            return [
                (first_reply, True, False),
                (prompt, True, "？" in prompt or "?" in prompt),
                (varied(["お気に入りなんだね。", "好きって気持ちが伝わったよ。", "その子が好きなんだね。", "好きなところがあるんだね。", "動物のお話を聞かせてくれたね。", "好きって教えてくれてありがとう。"], topic_index, variant), True, False),
                (varied(["その子のことを想像してみるね。", "好きな動物がいるっていいね。", "動物っておもしろいね。", "その動物のお話、もっと聞きたいな。", "コロンもその子に会ってみたいな。", "好きなところが伝わったよ。"], topic_index, variant), True, False),
                (varied(["また好きな動物を教えてね。", "お話ししてくれてありがとう。", "コロンにも教えてくれてうれしいよ。", "うん、聞かせてくれてありがとう。", "またお話ししようね。", "そのお話、楽しいね。"], topic_index, variant), True, False),
            ]
        elif "ごっこ" in phrase:
            first_reply = f"{topic}ごっこをしたんだね！"
        else:
            first_reply = echo_child_statement(phrase)
        return [
            (first_reply, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["コロンもその様子を思い浮かべてみるね。", "よく見つけたね！", "どんなところにいたのか想像してみるよ。", "その場面、見てみたくなるね。", "そんなことがあったんだね。", "自然にはおもしろいことがあるね。"], topic_index, variant), True, False),
            (varied(["よく気づいたね。", "見つけるのが上手だね！", "どんなふうだったか伝わってきたよ。", "おもしろい発見だね。", "そのお話、すてきだね。", "コロンもびっくり！"], topic_index, variant), True, False),
            (varied(["また見つけたら教えてね。", "そのこと、また聞かせてね。", "お話ししてくれてありがとう。", "見たものをほかにも教えてね。", "コロンに教えてくれてうれしいよ。", "自然のお話、またしようね。"], topic_index, variant), True, False),
        ]
    if category == "places_weather":
        if topic == "旅行":
            first_reply = "遠くへお出かけしたんだね！"
        elif "雨" in topic or "晴れ" in topic or "くもり" in topic or "雪" in topic or "風" in topic or "暑い" in topic or "寒い" in topic:
            first_reply = f"{phrase}って教えてくれたね。"
        elif topic == "車で移動":
            first_reply = "車に乗って出かけたんだね。"
        elif topic == "バスで移動":
            first_reply = "バスに乗ったんだね。"
        elif topic == "電車で移動":
            first_reply = "電車に乗ったんだね。"
        elif "行った" in phrase:
            first_reply = f"{topic}に行ったんだね。"
        else:
            first_reply = echo_child_statement(phrase)
        return [
            (first_reply, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["どんな場所だったか想像してみるね。", "その景色、見てみたいな。", "お出かけのお話、聞くのが好きだよ。", "その時の様子を思い浮かべてみるね。", "その時のことが伝わってきたよ。", "コロンもそこへ行った気分になったよ。"], topic_index, variant), True, False),
            (varied(["行ってみたんだね！", "そこで過ごしたんだね。", "お出かけできてよかったね。", "見つけたものがあったら教えてね。", "お外のお話を聞かせてくれたね。", "どんな景色か気になるな。"], topic_index, variant), True, False),
            (varied(["またその場所のお話を聞かせてね。", "お話ししてくれてありがとう。", "見たものをほかにも教えてね。", "その時のこと、また聞きたいな。", "コロンに教えてくれてうれしいよ。", "お出かけのお話、またしようね。"], topic_index, variant), True, False),
        ]
    if category == "learning_creativity":
        if topic == "ひらがな" and "読め" in phrase:
            prompt = "どの字を読めたの？"
        elif topic == "ひらがな" and "書" in phrase:
            prompt = "どの字を書いたの？"
        if topic == "見てほしい":
            first_reply = "うん、見せて！"
        elif topic == "聞いてほしい":
            first_reply = "うん、聞かせて！"
        elif topic == "読んでほしい":
            first_reply = "もちろん、いっしょに読もう。"
        elif topic in {"知りたい", "教えて"}:
            first_reply = "気になったんだね。いっしょに考えよう。"
        elif topic in {"手伝ってほしい", "作りたい", "描きたい"}:
            first_reply = "やってみたいんだね！"
        else:
            first_reply = "やってみたんだね！"
        return [
            (first_reply, True, False),
            (prompt, True, "？" in prompt or "?" in prompt),
            (varied(["自分で考えたんだね。", "工夫したところがあるんだね。", "やってみたこと、コロンに伝わったよ。", "自分で見つけたんだね。", "がんばったところがあったね。", "新しいことに気づいたんだね。"], topic_index, variant), True, False),
            (varied(["やってみるって楽しいね。", "できたところを見せてくれたね。", "ゆっくり考えていいんだよ。", "その工夫、いいね！", "一生懸命だったんだね。", "自分のやり方を見つけたね。"], topic_index, variant), True, False),
            (varied(["聞かせてくれてありがとう。", "コロンに見せてくれてうれしいな。", "いっしょにできてうれしいよ。", "また教えてね。", "そのお話、楽しいね。", "うん、わかったよ。"], topic_index, variant), True, False),
        ]
    # Conversation control: these outputs carry explicit routing actions.
    if topic == "訂正":
        return [
            ("教えてくれてありがとう。どこが違ったか教えてくれる？", True, True),
            ("そっか、ちがうんだね。言い直すね。", True, False),
            ("わかったよ。正しいお話を聞かせてね。", True, False),
            ("教えてくれたら、そっちに直すね。", True, False),
            ("もう一度聞かせてくれる？", True, True),
        ]
    if topic == "題材の訂正":
        corrected = phrase.replace("電車じゃなくて", "").replace("ほんとうは", "").removesuffix("だよ")
        return [
            ("教えてくれてありがとう。言い直すね。", True, False),
            ("わかった、" + corrected + "のお話にするね。", True, False),
            ("そっちなんだね。今の話題を直したよ。", True, False),
            ("うん、教えてくれた方で続けよう。", True, False),
            ("訂正してくれてありがとう。ちゃんと聞いたよ。", True, False),
        ]
    if topic in {"会話を止める", "さようなら", "話したくない"}:
        if topic == "会話を止める":
            return [
                ("わかったよ。ここでお話はおしまいにしよう。", False, False),
                ("教えてくれてありがとう。また話したくなったら聞くね。", False, False),
                ("うん、ここで止めるね。", False, False),
                ("またね。コロンはここにいるよ。", False, False),
                ("一緒にお話しできて楽しかったよ。", False, False),
            ]
        if topic == "話したくない":
            return [
                ("わかったよ。今は話さなくて大丈夫。", True, False),
                ("話したくなったら、いつでも聞くね。", True, False),
                ("うん、そっとしておくね。", True, False),
                ("教えてくれてありがとう。", True, False),
                ("ここにいるよ。", True, False),
            ]
        return [
            ("またね！お話ししてくれてありがとう。", False, False),
            ("うん、またお話ししようね。", False, False),
            ("ばいばい。また会おうね。", False, False),
            ("楽しかったよ。またね！", False, False),
            ("コロンはここにいるよ。", False, False),
        ]
    if topic == "いやだと伝える":
        return [
            ("わかったよ。やめるね。", False, False),
            ("教えてくれてありがとう。今のことはやめよう。", False, False),
            ("うん、いやなんだね。無理にしなくていいよ。", False, False),
            ("わかったよ。別のことにしよう。", False, False),
            ("ちゃんと教えてくれてありがとう。", False, False),
        ]
    if topic == "知らない":
        return [
            ("そっか、知らないんだね。", True, False),
            ("知らないこともあるよ。", True, False),
            ("教えてくれてありがとう。", True, False),
            ("いっしょに考えてみる？", True, True),
            ("わからない時は、知らないって言っていいんだよ。", True, False),
        ]
    if topic == "大丈夫":
        return [
            ("大丈夫なんだね。", True, False),
            ("そう聞けてよかった。", True, False),
            ("もう平気になったんだね。", True, False),
            ("教えてくれてありがとう。", True, False),
            ("また困ったら言ってね。", True, False),
        ]
    if topic == "同意":
        return [
            ("うん、そうなんだね。", True, False),
            ("そう思ったんだね。", True, False),
            ("わかったよ。", True, False),
            ("うんうん、聞いてるよ。", True, False),
            ("教えてくれてありがとう。", True, False),
        ]
    if topic == "できた報告":
        return [
            ("できたんだね！", True, False),
            ("終わったんだね。", True, False),
            ("やったね！", True, False),
            ("がんばったね。", True, False),
            ("できたことを教えてくれてありがとう。", True, False),
        ]
    if topic in {"聞いて", "話の続き", "付け足し", "話を続ける", "聞き返す", "話を始める"}:
        if topic == "聞き返す":
            return [
                ("もちろん。もう一度言うね。", True, False),
                ("ゆっくり話すね。", True, False),
                ("聞き直してくれてありがとう。", True, False),
                ("わかりにくかったね。言い方を変えてみるね。", True, False),
                ("どのあたりをもう一度聞きたい？", True, True),
            ]
        return [
            ("うん、聞いてるよ。", True, False),
            (prompt, True, True),
            ("うん、続きを聞かせて。", True, False),
            ("ゆっくりで大丈夫だよ。", True, False),
            ("教えてくれてありがとう。", True, False),
        ]
    if topic == "話題を変える":
        return [
            ("わかったよ。新しいお話にしよう。", True, False),
            ("今のお話はおしまいにするね。", True, False),
            ("次は何のお話にする？", True, True),
            ("いいよ。きみが選んだお話にしよう。", True, False),
            ("次の話題を教えてくれてありがとう。", True, False),
        ]
    if topic == "名前を聞く":
        return [
            ("コロンだよ。", True, False),
            ("コロンって呼んでね。", True, False),
            ("ぼくはコロン。よろしくね！", True, False),
            ("コロンだよ。名前を聞いてくれてありがとう。", True, False),
            ("コロンっていうんだ。", True, False),
        ]
    if topic == "好きなものを聞く":
        return [
            ("コロンは想像して遊ぶのが好きだよ。", True, False),
            ("お話を聞くのも好きだよ。", True, False),
            ("いろんな遊びを一緒に考えるのが好き！", True, False),
            ("子どもが考えたお話を聞くのが好きだよ。", True, False),
            ("コロンの好きなことを聞いてくれてありがとう。", True, False),
        ]
    if topic == "何でもない":
        return [
            ("わかったよ。", True, False),
            ("話したくなったら聞かせてね。", True, False),
            ("うん、ここにいるよ。", True, False),
            ("急がなくて大丈夫だよ。", True, False),
            ("教えてくれてありがとう。", True, False),
        ]
    return [
        ("そうなんだね。", True, False),
        (prompt, True, True),
        ("うん、聞いてるよ。", True, False),
        ("教えてくれてありがとう。", True, False),
        ("続きを聞かせてね。", True, False),
    ]


entries = []
for category, text in GROUPS.items():
    rows = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if len(rows) != 25:
        raise ValueError(f"{category}: expected 25 topics, got {len(rows)}")
    for index, row in enumerate(rows, start=1):
        topic, utterance_a, utterance_b, prompt = row.split("|", 3)
        for variant, phrase in enumerate((utterance_a, utterance_b), start=1):
            response_rows = responses(category, topic, prompt, phrase, index, variant)
            response_objects = []
            for response_index, (answer, continues, asks_question) in enumerate(response_rows, start=1):
                answer = answer.strip()
                asks_question = asks_question and ("？" in answer or "?" in answer)
                response_objects.append({
                    "id": f"r{response_index}",
                    "text": answer,
                    "continues": continues,
                    "asks_question": asks_question,
                    "next_topic": category if continues else None,
                })
            safety_sensitive = (category == "needs_and_routine" and topic in {
                "おなかの痛み", "頭の痛み", "歯の痛み", "けが", "具合が悪い", "トイレ", "助けを求める"
            }) or (category == "family_and_friends" and topic == "秘密と言われた")
            priority = 100 if safety_sensitive else 50
            if safety_sensitive:
                session_action = "route_to_safety"
            elif topic == "訂正":
                session_action = "await_correction"
            elif topic in {"題材の訂正", "話題を変える"}:
                session_action = "replace_current_topic" if topic == "題材の訂正" else "await_new_topic"
            elif topic == "いやだと伝える":
                session_action = "respect_stop"
            elif topic == "聞き返す":
                session_action = "repeat_last_response"
            elif not response_objects[0]["continues"]:
                session_action = "end_conversation"
            else:
                session_action = "set_current_topic"
            topic_value = None
            if topic == "題材の訂正":
                topic_value = phrase.replace("電車じゃなくて", "").replace("ほんとうは", "").removesuffix("だよ")
            entries.append({
                "id": f"{category}.{index:02d}.{variant}",
                "category": category,
                "intent": topic,
                "patterns": [phrase, *ALIASES.get(phrase, [])],
                "priority": priority,
                "safety_sensitive": safety_sensitive,
                "session_action": session_action,
                "topic_value": topic_value,
                "responses": response_objects,
            })

all_patterns = [pattern for entry in entries for pattern in entry["patterns"]]
if len(entries) != 500:
    raise ValueError(f"expected 500 entries, got {len(entries)}")
if len(set(all_patterns)) != len(all_patterns):
    duplicates = sorted({phrase for phrase in all_patterns if all_patterns.count(phrase) > 1})
    raise ValueError(f"duplicate patterns: {duplicates}")
if any(len(entry["responses"]) != 5 for entry in entries):
    raise ValueError("each entry must have exactly five responses")
if any(len({response["text"] for response in entry["responses"]}) != 5 for entry in entries):
    raise ValueError("each entry must have five distinct response choices")
if any(response["asks_question"] != ("？" in response["text"] or "?" in response["text"])
       for entry in entries for response in entry["responses"]):
    raise ValueError("question flags must match question punctuation")
if any(not response["continues"] and response["asks_question"]
       for entry in entries for response in entry["responses"]):
    raise ValueError("a stopped or ended conversation cannot ask a follow-up")

data = {
    "schema_version": "1.1",
    "dictionary_revision": "2026-10-27-review-4",
    "locale": "ja-JP",
    "entry_count": len(entries),
    "match_pattern_count": len(all_patterns),
    "response_count": sum(len(entry["responses"]) for entry in entries),
    "description": "OuchiColon everyday Japanese conversation dictionary. Contains no stored child utterance history.",
    "integration": {
        "match": "normalize text, then exact match against each entry's patterns, including common speech variants",
        "response_selection": "choose one of five; avoid immediate repetition",
        "conversation_state": "keep current_topic only in memory for the current conversation; do not persist utterance text",
        "routing": "use session_action, topic_value, and next_topic to continue, correct, wait for a topic, stop, repeat, or end naturally",
        "session_actions": ["set_current_topic", "replace_current_topic", "await_new_topic", "await_correction", "repeat_last_response", "respect_stop", "end_conversation", "route_to_safety"],
        "safety": "existing safety/privacy engine must run before general dictionary matching",
        "question_policy": "questions are optional and sparse; ask at most one follow-up in a response; never ask after a stop or goodbye",
    },
    "categories": list(GROUPS.keys()),
    "entries": entries,
}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {OUT}: {len(entries)} patterns, {data['response_count']} responses")
