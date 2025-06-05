const placementBoard = document.getElementById('placementBoard');
const shootingBoard = document.getElementById('shootingBoard');
const statusDiv = document.getElementById('status');
const doneButton = document.getElementById('doneButton');
const waitingDiv = document.createElement('div');
const BOARD_SIZE = 10;
const MAX_SHIPS = 10;

const userUID = getCookie("userUID");
if (!userUID) {
    redirectToLogin("Error: UserUID not found. Please log in again!");
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
waitingDiv.innerHTML = '<h3>Waiting for other player</h3><div class="timer">0 seconds</div>';
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
            updateStatus("All ships placed. Click 'Ready' button!");
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
    updateStatus("Waiting for second player...");
    waitingForOpponent = true;
}

function handleSocketMessage(event) {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'waiting':
            updateStatus(message.message);
            waitingForOpponent = true;
            break;
        case 'start':
            waitingForOpponent = false;
            gameActive = true;
            enableBoard(placementBoard);
            updateStatus(message.message);
            waitingDiv.style.display = 'none';
            stopWaitingTimer();
            break;
        case 'turn':
            waitingForOpponent = !message.yourTurn;
            gameActive = true;
            waitingDiv.style.display = 'none';
            stopWaitingTimer();
            
            if (message.yourTurn) {
                enableBoard(shootingBoard);
                updateStatus("Your turn!");
            } else {
                disableBoard(shootingBoard);
                updateStatus("Opponent's turn...");
            }
            break;
        case 'shotResult':
            handleShotResult(message);
            break;
        case 'opponentShot':
            handleOpponentShot(message);
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

function handleOpponentShot(message) {
    const cell = document.querySelector(`#placementBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (cell) {
        cell.classList.add(message.hit ? 'hit' : 'miss');
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
    waitingForOpponent = false;
    stopWaitingTimer();

    // Set game end messages
    let gameEndMessage = "";
    if (message.message.includes("won")) {
        gameEndMessage = "Congratulations, you won!";
    } else if (message.message.includes("lost")) {
        gameEndMessage = "Sorry, you lost!";
    } else {
        gameEndMessage = message.message;
    }

    // Clear previous content and set game results
    waitingDiv.innerHTML = `
        <h2>Game Over</h2>
        <p>${gameEndMessage}</p>
    `;

    // Create navigation button
    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Main Page';
    backButton.classList.add('end-game-button');
    backButton.addEventListener('click', () => {
        navigateTo("../MAINPAGE/mainpage.html");
    });

    // Add button to waitingDiv
    waitingDiv.appendChild(backButton);
    waitingDiv.style.display = 'block';

    // Update status
    updateStatus("<h2>Game Over</h2>");

    // Disable boards
    disableBoard(placementBoard);
    disableBoard(shootingBoard);
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
        timerElement.textContent = `${waitingTimer} seconds`;
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
            alert("Successfully logged out!");
            navigateTo("../LOGIN/login.html");
        }
    })
    .catch(error => {
        console.error("Error during logout: ", error);
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
