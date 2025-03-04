function register() {
    var username = document.getElementById("username");
    var email = document.getElementById("email");
    var password = document.getElementById("password");
    var confirmpassword = document.getElementById("confirmpassword");

    if (password.value == confirmpassword.value) {
        fetch("http://localhost/pr/torpedo/api/register", 
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({"username": username.value, "email": email.value, "password": password.value})
            }).then(response => response.json())
            .then(data => {
                console.log(data);
            })
            .catch(error => {
                console.error("Hiba történt a regisztráció során: ", error);
            })
    } else {
        password.value = "";
        confirmpassword.value = "";

        alert("A jelszó és a megerősített jelszó nem egyezik!");
    }
}
