const Engine = {
    current: "login",
    
    login: function() {
        var username = document.getElementById("username").value;
        var password = document.getElementById("password").value;
        
        if (username === "admin" && password === "1234") {
            alert("ورود موفقیت‌آمیز بود");
            this.open("home");
        } else {
            alert("نام کاربری یا رمز عبور اشتباه است");
        }
    },
    
    open: function(view) {
        document.getElementById("app").innerHTML = "";
        if (view === "home") {
            this.loadHomePage();
        }
    },

    loadHomePage: function() {
        document.getElementById("app").innerHTML = "<h1>به اپ خوش آمدید</h1><p>شما به صفحه خانه وارد شدید.</p>";
    }
};

// آغاز اپلیکیشن با صفحه ورود
Engine.open("login");
