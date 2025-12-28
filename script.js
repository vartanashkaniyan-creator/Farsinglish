// تابع تولید کد
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

// اعتبارسنجی فرم
document.getElementById('contactForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const message = document.getElementById('message').value;

    if (name === '' || email === '' || message === '') {
        alert('لطفاً همه فیلدها را پر کنید');
    } else {
        alert('فرم با موفقیت ارسال شد');
    }
});
