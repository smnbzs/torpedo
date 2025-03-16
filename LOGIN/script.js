import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

var firebaseConfig = {
    apiKey: "AIzaSyAH2TNOIpLbbwo36_qYIbEfoYSjVNCtDFI",
    authDomain: "torpedo-67879.firebaseapp.com",
    projectId: "torpedo-67879",
    storageBucket: "torpedo-67879.firebasestorage.app",
    messagingSenderId: "654110680192",
    appId: "1:654110680192:web:9b76d73b5e88c38ea2f265",
    measurementId: "G-K608XGYTK7"
};

var app = initializeApp(firebaseConfig);

const submit = document.getElementById("submit");

submit.addEventListener("click", function(event) {
    event.preventDefault();
    var email = document.getElementById("email").value;
    var password = document.getElementById("password").value;

    const auth = getAuth();

    // Firebase bejelentkezés
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            const firebaseUID = user.uid;

            // Cookie beállítása
            document.cookie = `userUID=${firebaseUID}; path=/; max-age=3600`;  
            document.cookie = `userEmail=${email}; path=/; max-age=3600`;  

            alert("Sikeres bejelentkezés a Firebase-be!");

            fetch("http://localhost/torpedo/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "email": email,
                    "password": password,
                    "firebaseUID": firebaseUID 
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    console.log("Bejelentkezés sikeres:", data);
                    window.location.href = "../mainpage/mainpage.html";
                }
            })
            .catch(error => {
                console.error("Hiba történt a bejelentkezés során:", error);
            });
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            alert("Hiba történt a Firebase bejelentkezés során: " + errorMessage);
        });
});
