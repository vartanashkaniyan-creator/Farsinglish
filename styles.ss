* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    background-color: #f0f0f0;
    color: #333;
    text-align: center;
}

header {
    background-color: #333;
    color: white;
    padding: 10px 0;
}

nav ul {
    list-style-type: none;
}

nav ul li {
    display: inline;
    margin-right: 20px;
}

nav ul li a {
    color: white;
    text-decoration: none;
}

button {
    padding: 10px 20px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

button:hover {
    background-color: #45a049;
}

footer {
    margin-top: 50px;
    background-color: #333;
    color: white;
    padding: 10px;
}

/* طراحی واکنش‌گرا */
@media screen and (max-width: 600px) {
    nav ul li {
        display: block;
        margin: 5px 0;
    }
}
