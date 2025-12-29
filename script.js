const Engine = {
    current: "login",
    
    login: function() {
        var username = document.getElementById("username").value;
        var password = document.getElementById("password").value;
        
        if (username === "admin" && password === "1234") {
            alert("ورود موفقیت‌آمیز بود");
            this.open("lesson");
        } else {
            alert("نام کاربری یا رمز عبور اشتباه است");
        }
    },
    
    open: function(view) {
        document.getElementById("app").innerHTML = "";
        if (view === "lesson") {
            this.loadLessonPage();
        }
    },

    loadLessonPage: function() {
        document.getElementById("app").innerHTML = `
            <h1>دوره آموزشی</h1>
            <p>در اینجا محتوای آموزشی به صورت خودکار تولید خواهد شد.</p>
            <button onclick="Engine.startLesson()">شروع دوره</button>
        `;
    },

    startLesson: function() {
        document.getElementById("app").innerHTML = `
            <h1>درس 1: مقدمه‌ای بر برنامه‌نویسی</h1>
            <p>در این درس با مبانی اولیه برنامه‌نویسی آشنا می‌شوید.</p>
            <button onclick="Engine.completeLesson()">تمام کردن درس</button>
        `;
    },

    completeLesson: function() {
        document.getElementById("app").innerHTML = `
            <h1>درس تمام شد</h1>
            <p>تبریک! شما درس اول را تمام کردید.</p>
            <button onclick="Engine.open('home')">بازگشت به خانه</button>
        `;
    }
};

// آغاز اپلیکیشن با صفحه ورود
Engine.open("login");
