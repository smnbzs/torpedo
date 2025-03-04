function register() {
    var username = document.getElementById("username");
    var email = document.getElementById("email");
    var password = document.getElementById("password");
    var confirmpassword = document.getElementById("confirmpassword");

    if (password.value == confirmpassword.value) {
        fetch("localhost/api/register.php")
    } else {
        password.value = "";
        confirmpassword.value = "";

        alert("A jelszó és a megerősített jelszó nem egyezik!");
    }
}
