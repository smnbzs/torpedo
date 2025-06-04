import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAH2TNOIpLbbwo36_qYIbEfoYSjVNCtDFI",
    authDomain: "torpedo-67879.firebaseapp.com",
    projectId: "torpedo-67879",
    storageBucket: "torpedo-67879.firebasestorage.app",
    messagingSenderId: "654110680192",
    appId: "1:654110680192:web:9b76d73b5e88c38ea2f265",
    measurementId: "G-K608XGYTK7"
};

const app = initializeApp(firebaseConfig);

const submit = document.getElementById("submit");

submit.addEventListener("click", function(event) {
    event.preventDefault();

    var username = document.getElementById("username").value;
    var email = document.getElementById("email").value;
    var password = document.getElementById("password").value;
    var confirmpassword = document.getElementById("confirmpassword").value;

    var passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    var emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

    if (!passwordRegex.test(password)) {
        alert("The password must consist of a minimum of 8 characters, including numbers, lowercase, and uppercase letters.");
        return;
    }

    if (!emailRegex.test(email)) {
        alert("The email address provided is invalid!");
        return;
    }

    if (password == confirmpassword) {
        const auth = getAuth();
        createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            alert("The user has been successfully registered.");

            fetch("http://localhost/torpedo/api/register.php", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "username": username,
                    "email": email,
                    "password": password,
                    "uid": user.uid 
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Sikeres rögzítés a MySQL-ben:", data);
                window.location.href = "../LOGIN/login.html";
            })
            .catch(error => {
                console.error("Hiba történt a MySQL adatbázisba történő mentés során:", error);
            });

        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            alert(errorMessage);
        });
    } else {
        password = "";
        confirmpassword = "";
        alert("The password and its confirmation do not match.");
    }
});
