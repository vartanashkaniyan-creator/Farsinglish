function generate() {
  const input = document.getElementById("command").value;
  const model = parseDSL(input);
  const appHTML = buildApp(model);
  document.getElementById("preview").srcdoc = appHTML;
}

/* ========= PARSER (چندلایه) ========= */
function parseDSL(text) {
  const lines = text.split("\n");
  const tree = {};
  let currentBlock = null;
  let currentSub = null;

  lines.forEach(l => {
    let line = l.trim();
    if (!line) return;

    if (line.endsWith("{") && !currentBlock) {
      currentBlock = line.replace("{","").trim();
      tree[currentBlock] = {};
    }
    else if (line.endsWith("{") && currentBlock) {
      currentSub = line.replace("{","").trim();
      tree[currentBlock][currentSub] = {};
    }
    else if (line === "}") {
      if (currentSub) currentSub = null;
      else currentBlock = null;
    }
    else if (line.includes(":")) {
      const [k,v] = line.split(":");
      if (currentSub)
        tree[currentBlock][currentSub][k.trim()] = v.trim();
      else
        tree[currentBlock][k.trim()] = v.trim();
    }
  });

  return tree;
}

/* ========= RESOLVER + GENERATOR ========= */
function buildApp(model) {
  const app = model.APP || {};
  const screens = model.SCREENS || {};

  let body = `<h2>${app.NAME || "My App"}</h2>`;

  // HOME
  if (screens.home) {
    body += `<button onclick="go('lesson')">شروع</button>`;
  }

  // LESSON
  if (screens.lesson) {
    body += `
      <div id="lesson" class="page">
        <h3>Lesson 1</h3>
        <p>Hello = سلام</p>
        <button onclick="completeLesson()">پایان درس</button>
      </div>
    `;
  }

  // QUIZ (شرط‌دار)
  if (screens.quiz) {
    body += `
      <div id="quiz" class="page">
        <p>سلام یعنی؟</p>
        <button onclick="answer(true)">Hello</button>
        <button onclick="answer(false)">Bye</button>
      </div>
    `;
  }

  return `
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{
        font-family:sans-serif;
        background:${app.THEME === "dark" ? "#0f172a" : "#fff"};
        color:${app.THEME === "dark" ? "#fff" : "#000"};
        direction:${app.LANG?.includes("fa") ? "rtl":"ltr"};
        padding:15px;
      }
      button{width:100%;padding:12px;margin:6px 0;border-radius:12px}
      .page{display:none}
    </style>
  </head>
  <body>
    ${body}
    <script>
      let lessonDone = false;

      function go(id){
        document.querySelectorAll('.page').forEach(p=>p.style.display='none');
        const el = document.getElementById(id);
        if(el) el.style.display='block';
      }

      function completeLesson(){
        lessonDone = true;
        localStorage.setItem("lesson","done");
        alert("درس کامل شد");
        ${screens.quiz?.condition ? "go('quiz')" : ""}
      }

      function answer(ok){
        alert(ok ? "درست" : "غلط");
      }
    <\/script>
  </body>
  </html>
  `;
}
