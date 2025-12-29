document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("generateBtn");
  const input = document.getElementById("commandInput");
  const output = document.getElementById("output");

  if (!btn || !input || !output) {
    console.log("Elements not found");
    return;
  }

  btn.addEventListener("click", function () {
    const cmd = input.value.trim().toLowerCase();

    if (!cmd) {
      output.textContent = "⛔ دستور خالی است";
      return;
    }

    if (cmd.includes("todo") || cmd.includes("لیست")) {
      output.textContent =
`// Simple Todo App
<html>
<body>
<h1>Todo App</h1>
<input placeholder="New task" />
<button>Add</button>
</body>
</html>`;
    } else {
      output.textContent = "❓ دستور شناخته نشد";
    }
  });
});
