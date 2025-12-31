const Engine = {
  lang: "fa",
  score: 0,
  currentQuestion: 0,

  questions: [
    { question: "2 + 2 = ?", options: [2, 3, 4, 5], answer: 4 },
    { question: "5 + 3 = ?", options: [7, 8, 9, 10], answer: 8 },
    { question: "3 + 7 = ?", options: [10, 11, 12, 9], answer: 10 }
  ],

  languagePack: {
    fa: {
      loginTitle: "ورود به اپ",
      loginButton: "ورود",
      lessonTitle: "دوره آموزشی",
      startLesson: "شروع دوره",
      completeLesson: "تمام کردن درس",
      quizTitle: "آزمون",
      resultTitle: "نتیجه آزمون",
      resultMessage: "امتیاز شما",
      retry: "شروع دوباره آزمون"
    },
    en: {
      loginTitle: "Login",
      loginButton: "Login",
      lessonTitle: "Lesson",
      startLesson: "Start Lesson",
      completeLesson: "Complete Lesson",
      quizTitle: "Quiz",
      resultTitle: "Quiz Result",
      resultMessage: "Your Score",
      retry: "Retry Quiz"
    }
  },

  init() {
    this.bindUI();
  },

  bindUI() {
    document.getElementById("generateBtn")
      .addEventListener("click", () => this.generateCode());

    document.getElementById("previewBtn")
      .addEventListener("click", () => this.previewApp());
  },

  generateCode() {
    const code = this.buildPreviewApp();
    document.getElementById("output").textContent = code;
    localStorage.setItem("previewCode", code);
  },

  previewApp() {
    window.location.href = "preview.html";
  },

  t(key) {
    return this.languagePack[this.lang][key];
  },

  buildPreviewApp() {
    return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated App</title>
<style>
body{font-family:sans-serif;padding:20px}
button{padding:10px;margin:5px}
</style>
</head>
<body>
<div id="app"></div>

<script>
${this.previewEngine()}
<\/script>
</body>
</html>
    `.trim();
  },

  previewEngine() {
    return `
const App = {
  score: 0,
  q: 0,
  questions: ${JSON.stringify(this.questions)},

  start() {
    this.showQuestion();
  },

  showQuestion() {
    const q = this.questions[this.q];
    document.getElementById("app").innerHTML = \`
      <h3>\${q.question}</h3>
      \${q.options.map(o =>
        \`<button onclick="App.answer(\${o}, \${q.answer})">\${o}</button>\`
      ).join("")}
    \`;
  },

  answer(sel, cor) {
    if (sel === cor) this.score += 10;
    this.q++;
    if (this.q < this.questions.length) {
      this.showQuestion();
    } else {
      document.getElementById("app").innerHTML =
        '<h2>امتیاز نهایی: ' + this.score + '</h2>';
    }
  }
};

App.start();
    `.trim();
  }
};

Engine.init();
