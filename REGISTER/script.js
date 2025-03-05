function register() {
    var username = document.getElementById("username");
    var email = document.getElementById("email");
    var password = document.getElementById("password");
    var confirmpassword = document.getElementById("confirmpassword");

    var passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/;
    var emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

    if (!passwordRegex.test(password.value)) {
        alert("The password must be at least 8 characters long and contain a number, lowercase and uppercase letters.");
        return;
    }

    if (!emailRegex.test(email.value)) {
        alert("The provided email address is invalid!");
        return;
    }

    if (password.value === confirmpassword.value) {
        fetch("http://localhost/pr/torpedo/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "username": username.value,
                "email": email.value,
                "password": password.value
            })
        }).then(response => {
            if (!response.ok) {
                throw new Error('An error occurred during the registration process');
            }
            return response.json();
        })
        .then(data => {
            console.log(data);
            window.location.href = "../LOGIN/login.html";
        })
        .catch(error => {
            console.error("An error occurred during registration: ", error);
        });
    } else {
        password.value = "";
        confirmpassword.value = "";
        alert("The password and confirmed password do not match!");
    }
}
