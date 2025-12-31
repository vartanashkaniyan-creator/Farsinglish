const Engine = {
  current: "home",
  score: 0,
  quizIndex: 0,

  pages: [
    { id: "home", type: "home" },
    {
      id: "lesson",
      type: "lesson",
      text: "این محتوا به‌صورت خودکار توسط موتور ساخته شده است."
    },
    {
      id: "quiz",
      type: "quiz",
      questions: [
        { q: "2 + 2 = ؟", options: [2, 3, 4, 5], a: 4 },
        { q: "3 + 5 = ؟", options: [6, 7, 8, 9], a: 8 }
      ]
    },
    { id: "result", type: "result" }
  ],

  init() {
    this.render();
    this.open("home");
  },

  render() {
    const app = document.getElementById("app");
    app.innerHTML = "";

    this.pages.forEach(p => {
      const section = document.createElement("section");
      section.className = "view";
      section.dataset.view = p.id;

      if (p.type === "home") {
        section.innerHTML = `
          <div class="card">
            <h2>خوش آمدید</h2>
            <p>اپ ساخته‌شده با موتور دستور</p>
            <button data-go="lesson">شروع</button>
          </div>
        `;
      }

      if (p.type === "lesson") {
        section.innerHTML = `
          <div class="card">
            <h2>آموزش</h2>
            <p>${p.text}</p>
            <button data-go="quiz">رفتن به آزمون</button>
          </div>
        `;
      }

      if (p.type === "quiz") {
        const q = p.questions[this.quizIndex];
        section.innerHTML = `
          <div class="card">
            <h2>آزمون</h2>
            <p>${q.q}</p>
            <div class="options">
              ${q.options.map(o =>
                `<button class="option" data-answer="${o}">${o}</button>`
              ).join("")}
            </div>
          </div>
        `;
      }

      if (p.type === "result") {
        section.innerHTML = `
          <div class="card">
            <h2>نتیجه</h2>
            <p>امتیاز شما: <strong>${this.score}</strong></p>
            <button data-restart>شروع مجدد</button>
          </div>
        `;
      }

      app.appendChild(section);
    });

    this.bindEvents();
  },

  bindEvents() {
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.onclick = () => this.open(btn.dataset.go);
    });

    document.querySelectorAll("[data-answer]").forEach(btn => {
      btn.onclick = () => this.answer(Number(btn.dataset.answer));
    });

    const restart = document.querySelector("[data-restart]");
    if (restart) restart.onclick = () => this.reset();
  },

  answer(selected) {
    const quiz = this.pages.find(p => p.type === "quiz");
    const q = quiz.questions[this.quizIndex];

    if (selected === q.a) this.score += 10;

    this.quizIndex++;

    if (this.quizIndex < quiz.questions.length) {
      this.render();
      this.open("quiz");
    } else {
      this.open("result");
    }
  },

  reset() {
    this.score = 0;
    this.quizIndex = 0;
    this.render();
    this.open("home");
  },

  open(view) {
    document.querySelectorAll(".view").forEach(v =>
      v.classList.remove("active")
    );
    document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
    this.current = view;
  }
};

Engine.init();
