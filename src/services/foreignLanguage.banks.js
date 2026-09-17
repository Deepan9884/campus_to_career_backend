/**
 * Local fallback banks for the Foreign Language Lab.
 * Used ONLY when the AI provider fails — guarantees quiz & listening
 * ALWAYS work in real life instead of returning HTTP 500.
 */

function rotatePick(arr, seed, n) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const len = arr.length;
  const start = Math.abs(seed) % len;
  const out = [];
  for (let i = 0; i < Math.min(n, len); i++) {
    out.push(arr[(start + i) % len]);
  }
  // Shuffle options deterministically per seed so repeated generations differ
  return out.map((q, qi) => {
    const order = [0, 1, 2, 3].sort(
      (a, b) => ((seed >> (a * 3 + qi)) & 7) - ((seed >> (b * 3 + qi)) & 7)
    );
    return {
      questionText: q.questionText,
      options: order.map((o) => q.options[o]),
      correctOptionIndex: order.indexOf(q.correctOptionIndex),
      explanation: q.explanation,
    };
  });
}

function tierFor(targetExam) {
  const t = String(targetExam || "").toUpperCase();
  if (["N5", "N4", "A1", "A2"].includes(t)) return "beginner";
  if (["N3", "B1", "B2", "IELTS", "TOEFL"].includes(t)) return "intermediate";
  return "advanced";
}

/* ── QUIZ BANKS ─────────────────────────────────────────── */

const QUIZ_BANK = {
  Japanese: [
    { tier: "beginner", questionText: "「たべます」の意味は?", options: ["To drink", "To eat", "To go", "To see"], correctOptionIndex: 1, explanation: "たべます (tabemasu) means 'to eat' — N5 core verb." },
    { tier: "beginner", questionText: "正しい文はどれ?", options: ["わたしは学生です", "わたしが学生ですは", "わたし学生ですは", "ですわたしは学生"], correctOptionIndex: 0, explanation: "Basic です sentence: わたしは学生です (I am a student)." },
    { tier: "beginner", questionText: "「きのう」の反対は?", options: ["あした", "きょう", "けさ", "こんばん"], correctOptionIndex: 0, explanation: "きのう (yesterday) ↔ あした (tomorrow)." },
    { tier: "beginner", questionText: "___にほんへいきます。 (I ___ go to Japan.) — 空所に入るのは?", options: ["あした", "きのう", "せんしゅう", "さくねん"], correctOptionIndex: 0, explanation: "いきます is non-past, so only あした (tomorrow) fits." },
    { tier: "beginner", questionText: "「みず」の漢字は?", options: ["水", "火", "木", "金"], correctOptionIndex: 0, explanation: "みず (water) is written 水." },
    { tier: "beginner", questionText: "いち + に = ?", options: ["に", "さん", "よん", "ご"], correctOptionIndex: 1, explanation: "いち (1) + に (2) = さん (3)." },
    { tier: "beginner", questionText: "「がっこう___いきます」の助詞は?", options: ["へ", "を", "が", "も"], correctOptionIndex: 0, explanation: "Direction of movement takes へ (or に)." },
    { tier: "intermediate", questionText: "「のむ」の可能形は?", options: ["のめる", "のまれる", "のみたい", "のもう"], correctOptionIndex: 0, explanation: "Group-1 verb のむ → のめる (can drink)." },
    { tier: "intermediate", questionText: "雨が___、試合は中止です。(___ it rains, the match is cancelled.)", options: ["ふれば", "ふると", "ふるなら", "ふっても"], correctOptionIndex: 1, explanation: "ふると expresses a natural consequence — N4 grammar." },
    { tier: "intermediate", questionText: "「さびしい」の意味は?", options: ["Lonely", "Busy", "Famous", "Near"], correctOptionIndex: 0, explanation: "さびしい means lonely." },
    { tier: "intermediate", questionText: "けさ早く___しまった。(I ended up waking early.)", options: ["起きて", "起きる", "起きた", "起き"], correctOptionIndex: 0, explanation: "〜てしまった expresses completion/regret." },
    { tier: "advanced", questionText: "「あいまい」の意味は?", options: ["Vague", "Strict", "Bright", "Narrow"], correctOptionIndex: 0, explanation: "あいまい means vague/ambiguous — N2 vocabulary." },
    { tier: "advanced", questionText: "___努力した___、合格できなかった。(No matter how hard I tried, I failed.)", options: ["いくら〜ても", "もし〜たら", "たとえ〜ば", "なぜ〜か"], correctOptionIndex: 0, explanation: "いくら〜ても = 'no matter how much…'." },
    { tier: "advanced", questionText: "「かねてからの願い」の「かねてから」は?", options: ["Long-cherished", "Sudden", "Secret", "Small"], correctOptionIndex: 0, explanation: "かねてから = since long ago / long-cherished." },
    { tier: "advanced", questionText: "敬語: 先生が___。(The teacher ___ [honorific 'said']).", options: ["おっしゃった", "いった", "もうした", "申した"], correctOptionIndex: 0, explanation: "おっしゃる is the honorific of いう." },
  ],
  French: [
    { tier: "beginner", questionText: "« Je ___ étudiant. » (I am a student.)", options: ["suis", "es", "est", "sommes"], correctOptionIndex: 0, explanation: "être: je suis." },
    { tier: "beginner", questionText: "Le pluriel de « le livre » ?", options: ["les livres", "le livres", "des livre", "les livre"], correctOptionIndex: 0, explanation: "le → les, livre → livres." },
    { tier: "beginner", questionText: "« Demain » means…", options: ["Yesterday", "Tomorrow", "Today", "Tonight"], correctOptionIndex: 1, explanation: "demain = tomorrow." },
    { tier: "beginner", questionText: "Choisis l'article : ___ école", options: ["l'", "le", "la", "les"], correctOptionIndex: 0, explanation: "Before a vowel: l'école." },
    { tier: "beginner", questionText: "« Merci beaucoup » means…", options: ["Thank you very much", "Goodbye", "See you", "Excuse me"], correctOptionIndex: 0, explanation: "Core A1 politeness phrase." },
    { tier: "intermediate", questionText: "Passé composé : « Hier, je ___ au cinéma. »", options: ["suis allé", "vais", "irai", "aller"], correctOptionIndex: 0, explanation: "aller takes être: je suis allé." },
    { tier: "intermediate", questionText: "« Il faut que tu ___ tes devoirs. »", options: ["fasses", "fais", "faire", "fait"], correctOptionIndex: 0, explanation: "il faut que + subjonctif: que tu fasses." },
    { tier: "intermediate", questionText: "Le contraire de « toujours » ?", options: ["jamais", "souvent", "déjà", "encore"], correctOptionIndex: 0, explanation: "toujours (always) ↔ jamais (never)." },
    { tier: "advanced", questionText: "« Bien que fatigué, il continua. » — bien que + ?", options: ["Subjonctif", "Indicatif", "Conditionnel", "Impératif"], correctOptionIndex: 0, explanation: "bien que governs the subjunctive (literary past here)." },
    { tier: "advanced", questionText: "« C'est un pis-aller. » means…", options: ["A last resort", "A good deal", "A first step", "A secret"], correctOptionIndex: 0, explanation: "pis-aller = stopgap / last resort (C1 idiom)." },
    { tier: "advanced", questionText: "Accord : « les lettres que j'ai ___ »", options: ["écrites", "écrit", "écrite", "écrire"], correctOptionIndex: 0, explanation: "Past participle agrees with preceding direct object (lettres, fem. pl.)." },
    { tier: "advanced", questionText: "« Il s'en est fallu de peu. » means…", options: ["It was a close call", "He left early", "It rained a little", "He failed badly"], correctOptionIndex: 0, explanation: "C-level idiom for a near miss." },
  ],
  German: [
    { tier: "beginner", questionText: "« Ich ___ Anna. » (I am Anna.)", options: ["bin", "bist", "ist", "sind"], correctOptionIndex: 0, explanation: "sein: ich bin." },
    { tier: "beginner", questionText: "Der Plural von « das Buch »?", options: ["die Bücher", "die Buch", "die Buchs", "der Bücher"], correctOptionIndex: 0, explanation: "Buch → Bücher, article die." },
    { tier: "beginner", questionText: "« Danke schön » means…", options: ["Thank you very much", "Good morning", "Goodbye", "Sorry"], correctOptionIndex: 0, explanation: "Core A1 phrase." },
    { tier: "beginner", questionText: "Wähle den Artikel: ___ Frau", options: ["die", "der", "das", "den"], correctOptionIndex: 0, explanation: "Frau is feminine: die Frau." },
    { tier: "beginner", questionText: "« Heute » means…", options: ["Today", "Yesterday", "Tomorrow", "Now"], correctOptionIndex: 0, explanation: "heute = today." },
    { tier: "intermediate", questionText: "Perfekt: « Gestern ___ ich ins Kino ___. »", options: ["bin … gegangen", "habe … gegangen", "bin … gehen", "habe … geht"], correctOptionIndex: 0, explanation: "gehen takes sein: ich bin gegangen." },
    { tier: "intermediate", questionText: "« Ich freue mich ___ das Wochenende. »", options: ["auf", "über", "an", "für"], correctOptionIndex: 0, explanation: "sich freuen auf + Akk. (looking forward to)." },
    { tier: "intermediate", questionText: "Das Gegenteil von « schnell »?", options: ["langsam", "groß", "hell", "neu"], correctOptionIndex: 0, explanation: "schnell (fast) ↔ langsam (slow)." },
    { tier: "advanced", questionText: "« Er tut, ___ er keine Zeit hätte. »", options: ["als ob", "wenn", "weil", "dass"], correctOptionIndex: 0, explanation: "als ob + Konjunktiv II for unreal comparison." },
    { tier: "advanced", questionText: "« Das ist ein zweischneidiges Schwert. » means…", options: ["A double-edged sword", "A sharp knife", "A clean cut", "A heavy burden"], correctOptionIndex: 0, explanation: "Direct C-level idiom." },
    { tier: "advanced", questionText: "Konjunktiv II von « haben » (ich …)?", options: ["hätte", "habe", "hatte", "haben"], correctOptionIndex: 0, explanation: "ich hätte." },
    { tier: "advanced", questionText: "« sich ins Zeug legen » means…", options: ["To put in effort", "To lie down", "To dress up", "To give up"], correctOptionIndex: 0, explanation: "Idiom: to throw oneself into the work." },
  ],
  Spanish: [
    { tier: "beginner", questionText: "« Yo ___ estudiante. » (I am a student.)", options: ["soy", "eres", "es", "somos"], correctOptionIndex: 0, explanation: "ser: yo soy (identity)." },
    { tier: "beginner", questionText: "El plural de « el libro »?", options: ["los libros", "el libros", "las libros", "los libro"], correctOptionIndex: 0, explanation: "el → los, libro → libros." },
    { tier: "beginner", questionText: "« Gracias » means…", options: ["Thank you", "Please", "Hello", "Goodbye"], correctOptionIndex: 0, explanation: "Core A1 word." },
    { tier: "beginner", questionText: "Elige el artículo: ___ agua (fem. starting with stressed a)", options: ["el", "la", "los", "las"], correctOptionIndex: 0, explanation: "el agua (phonetic rule, still feminine)." },
    { tier: "beginner", questionText: "« ¿Dónde está el baño? » means…", options: ["Where is the bathroom?", "What time is it?", "How much is it?", "Who are you?"], correctOptionIndex: 0, explanation: "Key survival phrase." },
    { tier: "intermediate", questionText: "Pretérito: « Ayer ___ al cine. »", options: ["fui", "voy", "iré", "iba siempre"], correctOptionIndex: 0, explanation: "ir, pretérito: yo fui." },
    { tier: "intermediate", questionText: "« Espero que ___ buen tiempo. »", options: ["haga", "hace", "hacer", "haciendo"], correctOptionIndex: 0, explanation: "esperar que + subjuntivo: haga." },
    { tier: "intermediate", questionText: "Lo contrario de « siempre »?", options: ["nunca", "a veces", "ya", "todavía"], correctOptionIndex: 0, explanation: "siempre ↔ nunca." },
    { tier: "advanced", questionText: "« De haberlo sabido, habría venido. » — structure?", options: ["Past conditional perfect (hypothetical past)", "Future", "Imperative", "Present"], correctOptionIndex: 0, explanation: "De haber + participio = 'had I known'." },
    { tier: "advanced", questionText: "« Estar hecho polvo » means…", options: ["To be exhausted", "To be dusty", "To be angry", "To be lost"], correctOptionIndex: 0, explanation: "Colloquial idiom: shattered/tired out." },
    { tier: "advanced", questionText: "Subjuntivo imperfecto de « hablar » (yo)…", options: ["hablara", "hable", "hablaba", "hablado"], correctOptionIndex: 0, explanation: "hablara/hablase." },
    { tier: "advanced", questionText: "« No tener pelos en la lengua » means…", options: ["To speak bluntly", "To be silent", "To lie", "To whisper"], correctOptionIndex: 0, explanation: "To not mince words." },
  ],
  English: [
    { tier: "beginner", questionText: "She ___ to school every day.", options: ["goes", "go", "going", "gone"], correctOptionIndex: 0, explanation: "3rd person singular: she goes." },
    { tier: "beginner", questionText: "Choose the correct article: ___ honest man", options: ["an", "a", "the only", "no article"], correctOptionIndex: 0, explanation: "'honest' starts with a vowel sound: an honest man." },
    { tier: "beginner", questionText: "Past of « buy »?", options: ["bought", "buyed", "buying", "buys"], correctOptionIndex: 0, explanation: "Irregular: buy → bought." },
    { tier: "intermediate", questionText: "« If I ___ more time, I would finish it. »", options: ["had", "have", "will have", "has"], correctOptionIndex: 0, explanation: "Second conditional: if + past simple." },
    { tier: "intermediate", questionText: "Synonym of « rapid »?", options: ["swift", "slow", "late", "weak"], correctOptionIndex: 0, explanation: "rapid = swift." },
    { tier: "intermediate", questionText: "« The report ___ by tomorrow. » (passive future)", options: ["will be finished", "will finish", "is finish", "finishes"], correctOptionIndex: 0, explanation: "Future passive: will be + past participle." },
    { tier: "intermediate", questionText: "« Neither of the answers ___ correct. »", options: ["is", "are", "were being", "have"], correctOptionIndex: 0, explanation: "'Neither' is singular in formal usage." },
    { tier: "advanced", questionText: "« Scarcely had he arrived ___ the phone rang. »", options: ["when", "than", "then", "that"], correctOptionIndex: 0, explanation: "Scarcely…when (Than pairs with hardly… no — scarcely…when)." },
    { tier: "advanced", questionText: "« The committee ___ divided on this issue. » (BrE collective)", options: ["are", "is only", "was only", "be"], correctOptionIndex: 0, explanation: "Collective nouns can take plural verbs in BrE." },
    { tier: "advanced", questionText: "Meaning of « to sit on the fence »?", options: ["To avoid taking sides", "To rest", "To observe birds", "To build a wall"], correctOptionIndex: 0, explanation: "Idiom: remain neutral." },
    { tier: "advanced", questionText: "« Had I known, I ___ acted differently. »", options: ["would have", "will have", "would", "had"], correctOptionIndex: 0, explanation: "Third conditional inversion." },
    { tier: "advanced", questionText: "Closest to « ubiquitous »?", options: ["omnipresent", "rare", "fragile", "temporary"], correctOptionIndex: 0, explanation: "ubiquitous = found everywhere." },
  ],
};

function getFallbackQuiz(language, targetExam, seed) {
  const bank = QUIZ_BANK[language] || QUIZ_BANK.English;
  const tier = tierFor(targetExam);
  const s = typeof seed === "number" ? seed : Date.now() % 100000;
  let pool = bank.filter((q) => q.tier === tier);
  if (pool.length < 8) pool = bank.filter((q) => q.tier === tier || q.tier === "intermediate");
  if (pool.length < 8) pool = bank;
  return rotatePick(pool, s, 10);
}

/* ── LISTENING BANKS (distinct script per topic!) ───────── */

function LQ(questionText, options, correctOptionIndex, explanation) {
  return { questionText, options, correctOptionIndex, explanation };
}

const LISTENING_BANK = {
  Japanese: {
    "Daily conversation": {
      title: "毎日の会話 — Daily Conversation (N5)",
      script: "田中：おはよう、山田さん。きのうのパーティーはどうでしたか。山田：おはようございます。とても楽しかったです。田中さんのケーキはおいしかったです。田中：ありがとう。来週の日曜日、うちで昼ごはんを食べませんか。山田：いいですね。何時に行きますか。田中：十二時ごろ来てください。山田：わかりました。何か持っていきますか。田中：いいえ、何もいりません。",
      translation: "Tanaka: Good morning, Yamada. How was yesterday's party? Yamada: Good morning. It was a lot of fun. Your cake was delicious. Tanaka: Thank you. Won't you have lunch at my place next Sunday? Yamada: Sounds good. What time shall I come? Tanaka: Please come around twelve. Yamada: Understood. Shall I bring something? Tanaka: No, nothing needed.",
      questions: [
        LQ("パーティーはどうでしたか。", ["楽しくなかった", "とても楽しかった", "つまらなかった", "行かなかった"], 1, "山田さんは「とても楽しかったです」と言いました。"),
        LQ("昼ごはんは何曜日ですか。", ["土曜日", "日曜日", "月曜日", "金曜日"], 1, "「来週の日曜日」と言いました。"),
        LQ("何時に行きますか。", ["十一時", "十二時ごろ", "一時", "十時"], 1, "「十二時ごろ来てください」と言いました。"),
      ],
    },
    "Station announcement": {
      title: "駅のアナウンス — Station Announcement (N5)",
      script: "みなさん、おはようございます。つぎは、しんじゅく、しんじゅくです。電車をおりるときは、忘れ物に気をつけてください。つぎの電車は九時十五分です。切符をなくした方は、駅の人に聞いてください。",
      translation: "Good morning, everyone. Next stop is Shinjuku, Shinjuku. When you get off, watch your belongings. The next train is at 9:15. If you lost your ticket, ask the station staff.",
      questions: [
        LQ("つぎの駅はどこですか。", ["渋谷", "新宿", "東京", "池袋"], 1, "「つぎは、しんじゅく」と言いました。"),
        LQ("つぎの電車は何時ですか。", ["八時十五分", "九時五分", "九時十五分", "十時十五分"], 2, "「九時十五分」と言いました。"),
        LQ("切符をなくした人はどうしますか。", ["電車に乗る", "家に帰る", "駅の人に聞く", "新しい切符を捨てる"], 2, "「駅の人に聞いてください」と言いました。"),
      ],
    },
    "Restaurant ordering": {
      title: "レストランで — At the Restaurant (N5)",
      script: "店員：いらっしゃいませ。何名さまですか。客：二人です。店員：こちらへどうぞ。お飲み物は何にしますか。客：オレンジジュースを二つください。店員：はい。お料理はお決まりですか。客：カレーライスとサラダをお願いします。店員：カレーの辛さはどうしますか。客：中辛でお願いします。",
      translation: "Staff: Welcome. How many people? Customer: Two. Staff: This way please. What drinks? Customer: Two orange juices. Staff: Certainly. Have you decided on food? Customer: Curry rice and salad, please. Staff: How spicy? Customer: Medium, please.",
      questions: [
        LQ("何人ですか。", ["一人", "二人", "三人", "四人"], 1, "「二人です」と言いました。"),
        LQ("飲み物は何ですか。", ["コーヒー二つ", "オレンジジュース二つ", "お茶一つ", "水二つ"], 1, "「オレンジジュースを二つ」と言いました。"),
        LQ("カレーの辛さは?", optionsFix(), 0, ""),
      ],
    },
    "University lecture": {
      title: "大学の授業 — University Lecture (N4)",
      script: "先生：今日は日本の季節について話します。日本には春、夏、秋、冬の四つの季節があります。春は桜が咲きます。三月から五月ごろです。夏は暑くて、雨がたくさん降ります。秋は涼しくて、紅葉がきれいです。冬は寒くて、雪が降ります。質問がある人は、手を挙げてください。",
      translation: "Teacher: Today I'll talk about Japan's seasons. Japan has four: spring, summer, autumn, winter. In spring cherry blossoms bloom, around March to May. Summer is hot with lots of rain. Autumn is cool with beautiful leaves. Winter is cold with snow. Anyone with questions, raise your hand.",
      questions: [
        LQ("日本にはいくつの季節がありますか。", ["二つ", "三つ", "四つ", "五つ"], 2, "「四つの季節」と言いました。"),
        LQ("桜が咲くのはいつですか。", ["夏", "秋", "冬", "春"], 3, "「春は桜が咲きます」と言いました。"),
        LQ("質問がある人はどうしますか。", ["立ってください", "手を挙げてください", "紙に書いてください", "外に出てください"], 1, "「手を挙げてください」と言いました。"),
      ],
    },
    "Job interview": {
      title: "面接 — Job Interview (N4)",
      script: "面接官：自己紹介をお願いします。学生：はい。私は大学で経済を勉強しています。去年、コンビニでアルバイトをしました。お客様と話すことが好きです。面接官：どうしてこの会社を選びましたか。学生：環境を守る仕事がしたいからです。面接官：週に何時間働けますか。学生：週に二十時間ぐらい働けます。",
      translation: "Interviewer: Please introduce yourself. Student: I study economics at university. Last year I worked part-time at a convenience store. I like talking with customers. Interviewer: Why did you choose this company? Student: Because I want work that protects the environment. Interviewer: How many hours a week can you work? Student: About twenty hours.",
      questions: [
        LQ("学生は何を勉強していますか。", ["経済", "歴史", "英語", "数学"], 0, "「経済を勉強しています」と言いました。"),
        LQ("どうしてこの会社を選びましたか。", ["給料が高いから", "家から近いから", "環境を守る仕事がしたいから", "友達がいるから"], 2, "「環境を守る仕事がしたいから」と言いました。"),
        LQ("週に何時間働けますか。", ["十時間", "十五時間", "二十時間", "三十時間"], 2, "「二十時間ぐらい」と言いました。"),
      ],
    },
    "Shopping dialogue": {
      title: "買い物 — Shopping (N5)",
      script: "客：すみません、このシャツはいくらですか。店員：三千五百円です。客：少し高いですね。もっと安いのはありますか。店員：こちらは二千円です。色は青と白があります。客：じゃあ、白いのをください。店員：ありがとうございます。二千円になります。",
      translation: "Customer: Excuse me, how much is this shirt? Staff: 3,500 yen. Customer: A bit expensive. Do you have a cheaper one? Staff: This one is 2,000 yen. Blue and white available. Customer: Then the white one, please. Staff: Thank you, that's 2,000 yen.",
      questions: [
        LQ("最初のシャツはいくらですか。", ["二千円", "三千円", "三千五百円", "四千円"], 2, "「三千五百円です」と言いました。"),
        LQ("安いシャツの色は?", optionsFix(), 0, ""),
        LQ("客は何を買いましたか。", ["青いシャツ", "白いシャツ", "ズボン", "何も買わなかった"], 1, "「白いのをください」と言いました。"),
      ],
    },
    "Travel directions": {
      title: "道案内 — Asking Directions (N5)",
      script: "旅行者：すみません、郵便局はどこですか。通行人：この道をまっすぐ行って、二つ目の信号を右に曲がります。コンビニのとなりです。旅行者：歩いて何分ぐらいですか。通行人：十分ぐらいです。旅行者：ありがとうございます。通行人：どういたしまして。",
      translation: "Traveller: Excuse me, where is the post office? Passerby: Go straight down this road, turn right at the second traffic light. It's next to the convenience store. Traveller: About how many minutes on foot? Passerby: About ten minutes. Traveller: Thank you. Passerby: You're welcome.",
      questions: [
        LQ("郵便局はどこにありますか。", ["コンビニのとなり", "駅の前", "公園の中", "学校のとなり"], 0, "「コンビニのとなり」と言いました。"),
        LQ("いつ右に曲がりますか。", ["一つ目の信号", "二つ目の信号", "三つ目の信号", "橋の前"], 1, "「二つ目の信号を右」と言いました。"),
        LQ("歩いて何分ですか。", ["五分", "十分", "十五分", "二十分"], 1, "「十分ぐらい」と言いました。"),
      ],
    },
    "Phone call": {
      title: "電話 — Phone Call (N4)",
      script: "佐藤：もしもし、佐藤です。鈴木さんはいますか。鈴木の母：あいにく、今出かけています。七時ごろ帰ります。佐藤：そうですか。では、また七時半ごろかけ直します。鈴木の母：わかりました。伝えておきます。佐藤：お願いします。失礼します。",
      translation: "Sato: Hello, this is Sato. Is Suzuki there? Suzuki's mother: Unfortunately she's out now. She'll be back around seven. Sato: I see. Then I'll call back around seven-thirty. Mother: Understood, I'll tell her. Sato: Please do. Goodbye.",
      questions: [
        LQ("鈴木さんは今どこにいますか。", ["家にいる", "出かけている", "会社にいる", "学校にいる"], 1, "「今出かけています」と言いました。"),
        LQ("鈴木さんは何時ごろ帰りますか。", ["六時", "七時", "七時半", "八時"], 1, "「七時ごろ帰ります」と言いました。"),
        LQ("佐藤さんはいつかけ直しますか。", ["六時半", "七時", "七時半", "八時"], 2, "「七時半ごろかけ直します」と言いました。"),
      ],
    },
  },
};

function optionsFix() {
  return ["placeholder — replaced below"];
}

// Fix the two placeholder questions above with real options
LISTENING_BANK.Japanese["Restaurant ordering"].questions[2] = LQ(
  "カレーの辛さはどうしましたか。",
  ["甘口", "中辛", "辛口", "辛さなし"],
  1,
  "「中辛でお願いします」と言いました。"
);
LISTENING_BANK.Japanese["Shopping dialogue"].questions[1] = LQ(
  "安いシャツにない色はどれですか。",
  ["青", "白", "赤", "青と白がある"],
  2,
  "「色は青と白があります」と言いました。"
);

const GENERIC_LISTENING = {
  French: {
    topicLine: {
      "Daily conversation": ["Bonjour Marie, comment s'est passé ton week-end ?", "Salut Paul ! Très bien, je suis allée au marché samedi et dimanche j'ai vu ma grand-mère.", "Et toi, tu as fait du sport ?", "Oui, j'ai couru une heure au parc."],
      "Station announcement": ["Mesdames et messieurs, le train pour Lyon partira du quai trois dans cinq minutes.", "Attention à la fermeture des portes.", "Les voyageurs sans billet doivent se présenter au guichet.", "Merci de votre attention."],
      "Restaurant ordering": ["Bonsoir, vous êtes combien ?", "Deux personnes, s'il vous plaît.", "Voici la carte. Que désirez-vous boire ?", "Deux jus d'orange et ensuite deux plats du jour, s'il vous plaît."],
      "University lecture": ["Aujourd'hui nous parlons du climat de la France.", "Il pleut souvent au nord et il fait chaud au sud en été.", "En automne les feuilles tombent et en hiver il neige en montagne.", "Posez vos questions à la fin du cours."],
      "Job interview": ["Présentez-vous, s'il vous plaît.", "J'étudie l'économie et j'ai travaillé un an dans un magasin.", "Pourquoi notre entreprise ?", "Parce que je veux protéger l'environnement."],
      "Shopping dialogue": ["Bonjour, combien coûte cette chemise ?", "Trente-cinq euros.", "C'est un peu cher. Avez-vous moins cher ?", "Oui, celle-ci à vingt euros, en bleu ou en blanc."],
      "Travel directions": ["Pardon, où est la poste ?", "Allez tout droit, tournez à droite au deuxième feu.", "C'est à côté de la supérette, à dix minutes à pied.", "Merci beaucoup !"],
      "Phone call": ["Allô, c'est Pierre. Marie est là ?", "Non, elle est sortie, elle rentre vers dix-neuf heures.", "D'accord, je rappellerai vers dix-neuf heures trente.", "Très bien, je lui dirai."],
    },
    translationOf: (t) => `French listening passage on "${t}" with exam-style questions below. Play the audio, listen twice, then answer without reading.`,
  },
  German: {
    topicLine: {
      "Daily conversation": ["Guten Morgen, Lisa! Wie war dein Wochenende?", "Hallo Max! Sehr gut, am Samstag war ich auf dem Markt und am Sonntag bei meiner Oma.", "Und du, hast du Sport gemacht?", "Ja, ich bin eine Stunde im Park gelaufen."],
      "Station announcement": ["Meine Damen und Herren, der Zug nach München fährt in fünf Minuten von Gleis sieben ab.", "Bitte achten Sie auf das Schließen der Türen.", "Fahrgäste ohne Fahrkarte melden sich bitte beim Personal.", "Vielen Dank."],
      "Restaurant ordering": ["Guten Abend, für wie viele Personen?", "Für zwei Personen, bitte.", "Hier ist die Karte. Was möchten Sie trinken?", "Zwei Orangensäfte und danach zweimal das Tagesgericht, bitte."],
      "University lecture": ["Heute sprechen wir über das Klima in Deutschland.", "Im Norden regnet es oft, im Süden ist der Sommer warm.", "Im Herbst fallen die Blätter, im Winter schneit es in den Bergen.", "Fragen bitte am Ende der Stunde."],
      "Job interview": ["Bitte stellen Sie sich vor.", "Ich studiere Wirtschaft und habe ein Jahr in einem Geschäft gearbeitet.", "Warum unser Unternehmen?", "Weil ich die Umwelt schützen möchte."],
      "Shopping dialogue": ["Guten Tag, was kostet dieses Hemd?", "Fünfunddreißig Euro.", "Das ist etwas teuer. Haben Sie etwas Billigeres?", "Ja, dieses hier für zwanzig Euro, in Blau oder Weiß."],
      "Travel directions": ["Entschuldigung, wo ist die Post?", "Gehen Sie geradeaus und biegen Sie an der zweiten Ampel rechts ab.", "Neben dem Supermarkt, etwa zehn Minuten zu Fuß.", "Vielen Dank!"],
      "Phone call": ["Hallo, hier ist Peter. Ist Maria da?", "Nein, sie ist ausgegangen und kommt gegen neunzehn Uhr zurück.", "Gut, ich rufe gegen neunzehn Uhr dreißig wieder an.", "Alles klar, ich richte es aus."],
    },
    translationOf: (t) => `German listening passage on "${t}" with exam-style questions below. Play the audio, listen twice, then answer without reading.`,
  },
  Spanish: {
    topicLine: {
      "Daily conversation": ["¡Buenos días, María! ¿Qué tal el fin de semana?", "¡Hola, Pablo! Muy bien, el sábado fui al mercado y el domingo vi a mi abuela.", "¿Y tú, hiciste deporte?", "Sí, corrí una hora en el parque."],
      "Station announcement": ["Señores pasajeros, el tren con destino a Madrid saldrá del andén cuatro en cinco minutos.", "Atención al cierre de puertas.", "Los pasajeros sin billete deben ir a la ventanilla.", "Gracias por su atención."],
      "Restaurant ordering": ["Buenas noches, ¿cuántos son?", "Dos, por favor.", "Aquí tienen la carta. ¿Qué desean beber?", "Dos zumos de naranja y después dos menús del día, por favor."],
      "University lecture": ["Hoy hablamos del clima de España.", "En el norte llueve a menudo y en el sur el verano es caluroso.", "En otoño caen las hojas y en invierno nieva en la montaña.", "Preguntas al final de la clase."],
      "Job interview": ["Preséntese, por favor.", "Estudio economía y trabajé un año en una tienda.", "¿Por qué nuestra empresa?", "Porque quiero proteger el medio ambiente."],
      "Shopping dialogue": ["Hola, ¿cuánto cuesta esta camisa?", "Treinta y cinco euros.", "Es un poco caro. ¿Tiene algo más barato?", "Sí, esta por veinte euros, en azul o en blanco."],
      "Travel directions": ["Perdone, ¿dónde está el correo?", "Siga recto y gire a la derecha en el segundo semáforo.", "Al lado del supermercado, a diez minutos a pie.", "¡Muchas gracias!"],
      "Phone call": ["Hola, soy Pedro. ¿Está María?", "No, ha salido, vuelve sobre las siete.", "Vale, llamaré sobre las siete y media.", "Muy bien, se lo diré."],
    },
    translationOf: (t) => `Spanish listening passage on "${t}" with exam-style questions below. Play the audio, listen twice, then answer without reading.`,
  },
  English: {
    topicLine: {
      "Daily conversation": ["Morning, Sarah! How was your weekend?", "Hi, Tom! Great — farmers' market on Saturday, grandma on Sunday.", "Did you get any exercise?", "Yes, an hour's run in the park."],
      "Station announcement": ["Good morning, passengers. The train to Oxford departs from platform three in five minutes.", "Please stand clear of the closing doors.", "Passengers without tickets should visit the ticket office.", "Thank you."],
      "Restaurant ordering": ["Good evening, how many of you?", "Two, please.", "Here are the menus. What would you like to drink?", "Two orange juices, then two set lunches, please."],
      "University lecture": ["Today we discuss Britain's climate.", "The north is often rainy; the south is warm in summer.", "Leaves fall in autumn; it snows on high ground in winter.", "Questions at the end, please."],
      "Job interview": ["Please introduce yourself.", "I study economics and worked a year in retail.", "Why our company?", "Because I want work that protects the environment."],
      "Shopping dialogue": ["Excuse me, how much is this shirt?", "Thirty-five pounds.", "That's a bit pricey. Anything cheaper?", "Yes, this one at twenty pounds, in blue or white."],
      "Travel directions": ["Excuse me, where's the post office?", "Go straight on, turn right at the second lights.", "Next to the supermarket, about ten minutes on foot.", "Thanks so much!"],
      "Phone call": ["Hello, it's Peter. Is Mary there?", "No, she's out — back around seven.", "OK, I'll call back around half past seven.", "Got it, I'll tell her."],
    },
    translationOf: (t) => `Native-speed announcement on "${t}". Listen twice, then answer without reading — exactly like the exam.`,
  },
};

function genericQuestionBank(lang, topic, lines) {
  const joined = lines.join(" ");
  const firstBit = lines[0] || "";
  return {
    title: `${topic} — ${lang} listening`,
    script: joined,
    translation: GENERIC_LISTENING[lang].translationOf(topic),
    questions: [
      LQ(
        `What is the main situation in this ${topic.toLowerCase()}?`,
        [topic, "A weather report", "A sports match", "A cooking recipe"],
        0,
        `The passage is entirely about: ${firstBit.slice(0, 60)}…`
      ),
      LQ("How many speakers / announcements do you hear?", ["One", "Two", "Three", "Four"], 1, "The dialogue has two voices taking turns."),
      LQ("What should you do after listening twice?", ["Answer from memory, like the real exam", "Read the script first", "Translate every word", "Skip the questions"], 0, "Exam rule: listen twice, then answer without reading."),
    ],
  };
}

function getFallbackListening(language, targetExam, topic) {
  const t = topic || "Daily conversation";
  if (LISTENING_BANK[language] && LISTENING_BANK[language][t]) {
    return LISTENING_BANK[language][t];
  }
  const generic = GENERIC_LISTENING[language] || GENERIC_LISTENING.English;
  const lines = generic.topicLine[t] || generic.topicLine["Daily conversation"];
  const langName = GENERIC_LISTENING[language] ? language : "English";
  return genericQuestionBank(langName, t, lines);
}

module.exports = {
  getFallbackQuiz,
  getFallbackListening,
};
