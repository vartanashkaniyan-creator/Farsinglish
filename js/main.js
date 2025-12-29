let generatedHTML = "";

function generateCode() {
  const cmd = document.getElementById("command").value.toLowerCase();
  const output = document.getElementById("output");

  if (cmd.includes("todo") || cmd.includes("کار")) {
    generatedHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Todo App</title>
</head>
<body>
  <h2>My Todo App</h2>
  <input placeholder="New task" />
  <button>Add</button>
</body>
</html>
`;
    output.textContent = generatedHTML;
  } else {
    output.textContent = "❌ دستور شناخته نشد";
  }
}

function goPreview() {
  if (!generatedHTML) {
    alert("اول کد رو تولید کن");
    return;
  }
  localStorage.setItem("previewCode", generatedHTML);
  window.location.href = "preview.html";
}
