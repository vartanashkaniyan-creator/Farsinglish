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
