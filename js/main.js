function generateCode() {
  const command = document.getElementById("command").value.trim().toLowerCase();
  const output = document.getElementById("output");

  if (!command) {
    output.textContent = "❗ لطفاً دستور را وارد کنید";
    return;
  }

  if (command.includes("todo")) {
    output.textContent = `
<!DOCTYPE html>
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
</html>
    `;
  } else {
    output.textContent = "❌ دستور شناخته نشد";
  }
}

// ❌ عمداً خالی گذاشتیم تا صفحه عوض نشه
function goPreview() {
  alert("پیش‌نمایش بعداً اضافه می‌شود 🙂");
}
