const placementBoard = document.getElementById('placementBoard');
const shootingBoard = document.getElementById('shootingBoard');
const statusDiv = document.getElementById('status');
const doneButton = document.getElementById('doneButton');
const waitingDiv = document.createElement('div');
const BOARD_SIZE = 10;
const MAX_SHIPS = 10;

const userUID = getCookie("userUID");
if (!userUID) {
    redirectToLogin("Hiba: Nem található userUID. Kérjük, jelentkezz be újra!");
}

let ships = [];
let shipsPlaced = 0;
let gameActive = false;
let waitingForOpponent = true;
let waitingTimer = 0;
let timerInterval = null;

waitingDiv.id = 'waitingMessage';
waitingDiv.classList.add('waiting-message');
document.body.insertBefore(waitingDiv, document.body.firstChild);
waitingDiv.innerHTML = '<h3>Várakozás a másik játékosra</h3><div class="timer">0 másodperc</div>';
startWaitingTimer();

const socket = new WebSocket('ws://localhost:16108');
socket.onopen = function() {
    socket.send(JSON.stringify({
        type: "sendUID",
        uid: userUID
    }));
};

socket.onmessage = handleSocketMessage;

generateBoard(placementBoard, handleCellClick, true);
generateBoard(shootingBoard, handleShootClick, true);

doneButton.addEventListener('click', submitShips);
doneButton.disabled = true;

function generateBoard(board, clickHandler, disabled = false) {
    const fragment = document.createDocumentFragment();
    
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            if (disabled) {
                cell.classList.add('disabled');
            }
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.addEventListener('click', clickHandler);
            fragment.appendChild(cell);
        }
    }
    
    board.appendChild(fragment);
}

function handleCellClick(event) {
    if (waitingForOpponent || shipsPlaced >= MAX_SHIPS) return;
    if (event.target.classList.contains('disabled')) return;

    const x = parseInt(event.target.dataset.x);
    const y = parseInt(event.target.dataset.y);

    if (!ships.some(ship => ship.x === x && ship.y === y)) {
        ships.push({ x, y });
        event.target.classList.add('ship');
        shipsPlaced++;

        if (shipsPlaced === MAX_SHIPS) {
            doneButton.disabled = false;
            updateStatus("Minden hajó elhelyezve. Kattints a 'Kész' gombra!");
        }
    }
}

function handleShootClick(event) {
    if (!gameActive || waitingForOpponent) return;
    if (event.target.classList.contains('disabled')) return;
    
    const x = parseInt(event.target.dataset.x);
    const y = parseInt(event.target.dataset.y);
    
    if (event.target.classList.contains('hit') || event.target.classList.contains('miss')) {
        return;
    }

    // Letiltjuk a táblát a lövés után
    disableBoard(shootingBoard);
    waitingForOpponent = true;

    socket.send(JSON.stringify({
        type: 'shoot',
        uid: userUID,
        x,
        y
    }));
}

function submitShips() {
    socket.send(JSON.stringify({
        type: 'placeShip',
        uid: userUID,
        ships: ships
    }));
    doneButton.disabled = true;
    disableBoard(placementBoard);
    updateStatus("Várakozás a második játékosra...");
}

function handleSocketMessage(event) {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'waiting':
            updateStatus("Várakozás a játékosra...");
            waitingForOpponent = true;
            break;
        case 'start':
            waitingForOpponent = false;
            enableBoard(placementBoard);
            updateStatus("Helyezd el a hajóidat!");
            showWaitingMessage(false);
            break;
        case 'shipsPlaced':
            updateStatus(message.message);
            break;
        case 'turn':
            gameActive = true;
            waitingForOpponent = !message.yourTurn;
            
            if (message.yourTurn) {
                enableBoard(shootingBoard);
                updateStatus("A te köröd - Lőj!");
            } else {
                disableBoard(shootingBoard);
                updateStatus("Az ellenfél lő...");
            }
            break;
        case 'shotResult':
            handleShotResult(message);
            break;
        case 'end':
            handleGameEnd(message);
            break;
        case 'gameOver':
            stopWaitingTimer();
            alert(message.message);
            navigateTo("../mainpage/mainpage.html");
            break;
    }
}

function handleShotResult(message) {
    const cell = document.querySelector(`#shootingBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (cell) {
        cell.classList.add(message.hit ? 'hit' : 'miss');
    }

    socket.send(JSON.stringify({
        type: 'getTurn',
        uid: userUID
    }));
}
function handleGameEnd(message) {
    gameActive = false;
    waitingForOpponent = false; // Állapot konzisztens tartása
    stopWaitingTimer(); // Leállítjuk az esetlegesen futó időzítőt

    // Előző tartalom törlése és a játék végeredményének beállítása
    waitingDiv.innerHTML = `<h2>Meccs véget ért</h2><p>${message.message}</p>`; // A szerver üzenetét használjuk

    // A navigációs gomb létrehozása
    const backButton = document.createElement('button');
    backButton.textContent = 'Vissza a főoldalra';
    backButton.classList.add('end-game-button'); // Opcionális: osztály a stílusozáshoz
    backButton.addEventListener('click', () => {
        navigateTo("../MAINPAGE/mainpage.html"); // Navigálás a főoldalra
    });

    // A gomb hozzáadása a waitingDiv-hez
    waitingDiv.appendChild(backButton);

    // A waitingDiv láthatóvá tétele
    waitingDiv.style.display = 'block'; // Mutassuk a div-et az üzenettel és gombbal

    // A státusz frissítése (opcionális, ha a statusDiv különálló)
    updateStatus("<h2>Meccs véget ért</h2>");

    // A játéktáblák letiltása (ez már a kódban volt, megtartjuk)
    disableBoard(placementBoard);
    disableBoard(shootingBoard);

    // A régi alert és timeout eltávolítva
    // // setTimeout(() => {
    // //     alert(message.message); // ELTÁVOLÍTVA
    // //     navigateTo("../MAINPAGE/mainpage.html"); // ELTÁVOLÍTVA
    // // }, 1500);

    // A showWaitingMessage(false) hívás eltávolítva, mert most mutatni akarjuk a div-et
    // showWaitingMessage(false); // ELTÁVOLÍTVA
}

function updateStatus(message) {
    statusDiv.innerHTML = message;
}

function enableBoard(board) {
    const cells = board.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('disabled');
    });
}

function disableBoard(board) {
    const cells = board.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.add('disabled');
    });
}

function showWaitingMessage(show) {
    if (show) {
        waitingDiv.style.display = 'block';
        startWaitingTimer();
    } else {
        waitingDiv.style.display = 'none';
        stopWaitingTimer();
    }
}

function startWaitingTimer() {
    stopWaitingTimer();
    waitingTimer = 0;
    updateWaitingTimer();
    
    timerInterval = setInterval(() => {
        waitingTimer++;
        updateWaitingTimer();
    }, 1000);
}

function stopWaitingTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateWaitingTimer() {
    const timerElement = waitingDiv.querySelector('.timer');
    if (timerElement) {
        timerElement.textContent = `${waitingTimer} másodperc`;
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

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
            clearCookies();
            alert("Sikeres kijelentkezés!");
            navigateTo("../LOGIN/login.html");
        }
    })
    .catch(error => {
        console.error("Hiba történt a kijelentkezés során: ", error);
    });
}

function clearCookies() {
    const cookies = ["userUID", "userEmail", "loginTime"];
    cookies.forEach(cookie => {
        document.cookie = `${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
}

function redirectToLogin(message) {
    alert(message);
    navigateTo("../LOGIN/login.html");
}

function navigateTo(url) {
    window.location.href = url;
}

if (!userUID) {
    logoutUser();
}
