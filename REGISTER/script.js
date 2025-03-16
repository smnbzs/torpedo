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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// A regisztrációs gomb, amit a felhasználó kattint
const submit = document.getElementById("submit");

submit.addEventListener("click", function(event) {
    event.preventDefault(); // Ne frissítse az oldalt

    var username = document.getElementById("username").value;
    var email = document.getElementById("email").value;
    var password = document.getElementById("password").value;
    var confirmpassword = document.getElementById("confirmpassword").value;

    // Az email és a jelszó formátumának ellenőrzése
    var passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    var emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

    if (!passwordRegex.test(password)) {
        alert("A jelszónak legalább 8 karakterből kell állnia, és tartalmaznia kell számot, kis- és nagybetűt.");
        return;
    }

    if (!emailRegex.test(email)) {
        alert("A megadott e-mail cím érvénytelen!");
        return;
    }

    if (password === confirmpassword) {
        const auth = getAuth();
        createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            alert("Felhasználó regisztrálva a Firebase-ben!");

            // Küldés a PHP API-nak MySQL adatbázisba
            fetch("http://localhost/torpedo/api/register.php", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "username": username,
                    "email": email,
                    "password": password,
                    "uid": user.uid // Firebase UID
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
        alert("A jelszó és a megerősített jelszó nem egyezik!");
    }
});
