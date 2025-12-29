document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("generateBtn");
  const input = document.getElementById("commandInput");
  const output = document.getElementById("output");

  btn.onclick = () => {
    const cmd = input.value.trim().toLowerCase();

    if (cmd === "") {
      output.textContent = "⛔ دستور وارد نشده";
      return;
    }

    if (cmd.includes("todo") || cmd.includes("لیست")) {
      output.textContent =
`<!-- Simple Todo App -->
<html>
<body>
<h1>Todo App</h1>
<input placeholder="New task" />
<button>Add</button>
</body>
</html>`;
    } else {
      output.textContent = "❌ دستور شناخته نشد";
    }
  };
});
