const placementBoard = document.getElementById('placementBoard');
const shootingBoard = document.getElementById('shootingBoard');
const statusDiv = document.getElementById('status');
const doneButton = document.getElementById('doneButton');
const socket = new WebSocket('ws://localhost:16108');

// Cookie lekérése név alapján
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Firebase UID lekérése a cookie-ból
const userUID = getCookie("userUID");

// Ha nincs UID, kijelentkeztetjük a felhasználót
if (!userUID) {
    alert("Hiba: Nem található userUID. Kérjük, jelentkezz be újra!");
    window.location.href = "../LOGIN/login.html"; // Átirányítás a bejelentkezési oldalra
}

let ships = [];
let shipsPlaced = 0;

// WebSocket kapcsolat nyitásakor küldjük az UID-t
socket.onopen = function(event) {
    console.log("WebSocket kapcsolat létrejött!");
    socket.send(JSON.stringify({
        type: "sendUID",
        uid: userUID, // Küldjük a Firebase UID-t
    }));
};

// Hajók elhelyezése
for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.addEventListener('click', handleCellClick);
        placementBoard.appendChild(cell);
    }
}

// Lövéshez tábla
for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.addEventListener('click', handleShootClick);
        shootingBoard.appendChild(cell);
    }
}

// Hajó elhelyezése
function handleCellClick(event) {
    if (shipsPlaced >= 10) return;

    const x = parseInt(event.target.dataset.x);
    const y = parseInt(event.target.dataset.y);

    if (!ships.some(ship => ship.x === x && ship.y === y)) {
        ships.push({ x, y });
        event.target.classList.add('ship');
        shipsPlaced++;

        if (shipsPlaced === 10) {
            doneButton.disabled = false;
            statusDiv.textContent = "Minden hajó elhelyezve. Kattints a 'Kész' gombra!";
        }
    }
}

// Lövés küldése
function handleShootClick(event) {
    const x = parseInt(event.target.dataset.x);
    const y = parseInt(event.target.dataset.y);

    socket.send(JSON.stringify({
        type: 'shoot',
        uid: userUID, // Küldjük a Firebase UID-t
        x: x,
        y: y,
    }));
}

// Hajók elküldése a szervernek
doneButton.addEventListener('click', function() {
    socket.send(JSON.stringify({
        type: 'placeShip',
        uid: userUID, // Küldjük a Firebase UID-t
        ships: ships,
    }));
    doneButton.disabled = true;
    statusDiv.textContent = "Várakozás a második játékosra...";
});

// WebSocket üzenetek kezelése
socket.onmessage = function(event) {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'waiting':
            statusDiv.textContent = message.message;
            break;
        case 'start':
            statusDiv.textContent = message.message;
            break;
        case 'shipsPlaced':
            statusDiv.textContent = message.message;
            break;
        case 'turn':
            statusDiv.textContent = message.yourTurn ? "Te következel!" : "Az ellenfél következik...";
            break;
        case 'shotResult':
            handleShotResult(message);
            break;
        case 'end':
            handleGameEnd(message);
            break;
        case 'gameOver': // Új üzenet típus kezelése
            alert(message.message);
            window.location.href = "../mainpage/mainpage.html"; // Átirányítás a főoldalra
            break;
    }
};

// Lövés eredményének kezelése
function handleShotResult(message) {
    const cell = document.querySelector(`#shootingBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (message.hit) {
        cell.classList.add('hit');
    } else {
        cell.classList.add('miss');
    }
}

// Játék vége
function handleGameEnd(message) {
    statusDiv.innerHTML = "<h2>Meccs véget ért</h2>";

    // Lövés gombok deaktiválása
    const cells = document.querySelectorAll('#shootingBoard .cell');
    cells.forEach(cell => {
        cell.removeEventListener('click', handleShootClick);
    });

    // Átirányítás a bejelentkezési oldalra
    setTimeout(() => {
        alert(message.message);
        window.location.href = "../LOGIN/login.html";
    }, 1500);
}

// Kijelentkezés kezelése
function logoutUser() {
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
        if (data.status === "success") {
            // Cookie-k törlése
            document.cookie = "userUID=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = "userEmail=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = "loginTime=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

            // Átirányítás a bejelentkezési oldalra
            alert("Sikeres kijelentkezés!");
            window.location.href = "../LOGIN/login.html";
        } else {
            console.error("Kijelentkezés sikertelen: ", data.message);
        }
    })
    .catch(error => {
        console.error("Hiba történt a kijelentkezés során: ", error);
    });
}

// Ha nincs UID, kijelentkeztetjük a felhasználót
if (!userUID) {
    logoutUser();
}