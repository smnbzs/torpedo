function getCookie(name) {
    let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return match[2];
    return null;
}

function deleteCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}

function logoutUser() {
    var userUID = getCookie("userUID");

    if (userUID) { 
        fetch("http://localhost/torpedo/api/logout.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "userUID": userUID
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status == "success") {
                deleteCookie("userUID");
                deleteCookie("userEmail");
                deleteCookie("loginTime");
                alert("Successfully logged out.");
                window.location.href = "../login/login.html";
            } else {
                console.error("Logout failed: ", data.message);
            }
        })
        .catch(error => {
            console.error("Error:", error);
        });
    } else {
        console.error("User UID not found in cookies");
    }
}

window.addEventListener("load", function() {
    var userUID = getCookie("userUID");
    var userEmail = getCookie("userEmail");

    if (userUID && userEmail) {
        var loginTime = getCookie("loginTime");
        if (loginTime) {
            var currentTime = new Date().getTime();
            var expirationTime = parseInt(loginTime) + (60 * 60 * 1000); 
            if (currentTime > expirationTime) {
                alert("Session expired. Please log in again.");
                logoutUser(); 
            }
        }
    } else {
        alert("Firstly, you must log in.");
        window.location.href = "../login/login.html";
    }

    username();

    const logoutButton = document.getElementById("logout");
    if (logoutButton) {
        logoutButton.addEventListener("click", function() {
            logoutUser();
        });
    }
});

function username() {
    var userUID = getCookie("userUID");
    if (!userUID) return;

    fetch("http://localhost/torpedo/api/getusername.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "userUID": userUID
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status == "success") {
            document.getElementById("username").innerText = data.username;
        } else {
            console.error("Error:", data.message);
        }
    })
    .catch(error => console.error("Fetch error:", error));
}