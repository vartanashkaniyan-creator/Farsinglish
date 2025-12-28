function generate() {
  const raw = document.getElementById("command").value;
  const lines = raw.split("\n");

  const cfg = {};
  lines.forEach(l => {
    const [k,v] = l.split("=");
    if(k && v) cfg[k.trim()] = v.trim();
  });

  let screens = (cfg.SCREENS || "").split(",");

  let body = `
    <h2>${cfg.APP_NAME || "My App"}</h2>
    <p>نوع اپ: ${cfg.APP_TYPE}</p>
  `;

  if (screens.includes("home")) {
    body += `<button onclick="show('lesson')">📘 درس‌ها</button>`;
  }

  if (screens.includes("lesson")) {
    body += `
      <div id="lesson" style="display:none">
        <h3>درس ۱</h3>
        <p>Hello = سلام</p>
        <button onclick="save()">ذخیره پیشرفت</button>
      </div>
    `;
  }

  if (cfg.QUIZ) {
    body += `
      <h3>آزمون</h3>
      <button onclick="alert('درست ✅')">گزینه ۱</button>
      <button onclick="alert('غلط ❌')">گزینه ۲</button>
    `;
  }

  const app = `
  <html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font-family:sans-serif;background:#111;color:#fff;padding:15px}
      button{width:100%;padding:10px;margin:5px 0;border-radius:10px}
    </style>
  </head>
  <body>
    ${body}
    <script>
      function show(id){
        document.getElementById(id).style.display='block';
      }
      function save(){
        localStorage.setItem("progress","lesson1");
        alert("ذخیره شد");
      }
    <\/script>
  </body>
  </html>
  `;

  document.getElementById("preview").srcdoc = app;
}
