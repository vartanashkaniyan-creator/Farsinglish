function generateCode() {
  const output = document.getElementById("output");
  const command = document.getElementById("command").value;

  output.textContent =
`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Todo App</title>
</head>
<body>
<h2>Todo App</h2>
<input placeholder="New task">
<button>Add</button>
</body>
</html>`;
}

function goPreview() {
  alert("پیش‌نمایش بعداً اضافه می‌شود");
}
