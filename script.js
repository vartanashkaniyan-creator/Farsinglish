function generateCode() {
    var command = document.getElementById('command').value.trim();
    var output = document.getElementById('output');

    if (command === "دکمه اضافه کن") {
        output.innerHTML = `<pre><button>Click Me</button></pre>`;
    } else if (command === "فرم ورود اضافه کن") {
        output.innerHTML = `<pre>
<form>
    <input type="text" placeholder="نام کاربری">
    <input type="password" placeholder="کلمه عبور">
    <button type="submit">ورود</button>
</form>
        </pre>`;
    } else {
        output.innerHTML = `<p>دستور نامعتبر. لطفاً دستور صحیح وارد کنید.</p>`;
    }
}
