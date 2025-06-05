var placementBoard = document.getElementById('placementBoard');
var shootingBoard = document.getElementById('shootingBoard');
var statusDiv = document.getElementById('status');
var doneButton = document.getElementById('doneButton');
var waitingDiv = document.createElement('div');
var BOARD_SIZE = 10;
var MAX_SHIPS = 10;

var SHIPS = [
    { name: 'Carrier', size: 5, count: 1 },
    { name: 'Battleship', size: 4, count: 1 },
    { name: 'Cruiser', size: 3, count: 1 },
    { name: 'Submarine', size: 3, count: 1 },
    { name: 'Destroyer', size: 2, count: 1 }
];

var userUID = getCookie("userUID");
if (!userUID) {
    redirectToLogin("Error: UserUID not found. Please log in again!");
}

let ships = [];
let shipsPlaced = 0;
let gameActive = false;
let waitingForOpponent = true;
let waitingTimer = 0;
let timerInterval = null;
let currentShip = 0;
let isHorizontal = true;
let placedShips = [];

waitingDiv.id = 'waitingMessage';
waitingDiv.classList.add('waiting-message');
document.body.insertBefore(waitingDiv, document.body.firstChild);
waitingDiv.innerHTML = '<h3>Waiting for other player</h3><div class="timer">0 seconds</div>';
startWaitingTimer();

var socket = new WebSocket('ws://localhost:16108');
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
    var fragment = document.createDocumentFragment();
    
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            var cell = document.createElement('div');
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
    if (waitingForOpponent || currentShip >= SHIPS.length) return;
    if (event.target.classList.contains('disabled')) return;

    var x = parseInt(event.target.dataset.x);
    var y = parseInt(event.target.dataset.y);
    
    if (placedShips.some(ship => ship.cells.some(cell => cell.x === x && cell.y === y))) return;

    var ship = SHIPS[currentShip];
    
    if (canPlaceShip(x, y, ship.size, isHorizontal)) {
        placeShip(x, y, ship);
        currentShip++;
        
        if (currentShip === SHIPS.length) {
            doneButton.disabled = false;
            updateStatus("All ships placed. Click 'Ready' button!");
        } else {
            updateStatus(`Place your ${SHIPS[currentShip].name} (${SHIPS[currentShip].size} cells)`);
        }
    }
}

function canPlaceShip(x, y, size, horizontal) {
    if (horizontal && x + size > BOARD_SIZE) return false;
    if (!horizontal && y + size > BOARD_SIZE) return false;
    
    for (let i = 0; i < size; i++) {
        var checkX = horizontal ? x + i : x;
        var checkY = horizontal ? y : y + i;
        
        if (placedShips.some(ship => ship.cells.some(cell => 
            cell.x === checkX && cell.y === checkY))) {
            return false;
        }
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                var adjX = checkX + dx;
                var adjY = checkY + dy;
                if (adjX >= 0 && adjX < BOARD_SIZE && adjY >= 0 && adjY < BOARD_SIZE) {
                    if (placedShips.some(ship => ship.cells.some(cell => 
                        cell.x === adjX && cell.y === adjY))) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}

function placeShip(x, y, ship) {
    var shipCells = [];
    for (let i = 0; i < ship.size; i++) {
        var cellX = isHorizontal ? x + i : x;
        var cellY = isHorizontal ? y : y + i;
        shipCells.push({ x: cellX, y: cellY });
        
        var cell = document.querySelector(`#placementBoard .cell[data-x='${cellX}'][data-y='${cellY}']`);
        cell.classList.add('ship');
        cell.classList.add(`${ship.name.toLowerCase()}`);
    }
    
    placedShips.push({
        name: ship.name,
        cells: shipCells
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && !waitingForOpponent && currentShip < SHIPS.length) {
        isHorizontal = !isHorizontal;
        updateStatus(`Rotated ship to ${isHorizontal ? 'horizontal' : 'vertical'} position`);
        
        var hoveredCell = document.querySelector('#placementBoard .cell:hover');
        if (hoveredCell) {
            var x = parseInt(hoveredCell.dataset.x);
            var y = parseInt(hoveredCell.dataset.y);
            showShipPreview(x, y, SHIPS[currentShip].size);
        }
    }
});

placementBoard.addEventListener('mouseover', (event) => {
    if (waitingForOpponent || currentShip >= SHIPS.length) return;
    if (!event.target.classList.contains('cell')) return;
    
    var x = parseInt(event.target.dataset.x);
    var y = parseInt(event.target.dataset.y);
    var ship = SHIPS[currentShip];
    
    showShipPreview(x, y, ship.size);
});

placementBoard.addEventListener('mouseout', () => {
    clearShipPreview();
});

function showShipPreview(x, y, size) {
    clearShipPreview();
    
    if (!canPlaceShip(x, y, size, isHorizontal)) {
        return;
    }
    
    for (let i = 0; i < size; i++) {
        var previewX = isHorizontal ? x + i : x;
        var previewY = isHorizontal ? y : y + i;
        
        if (previewX < BOARD_SIZE && previewY < BOARD_SIZE) {
            var cell = document.querySelector(`#placementBoard .cell[data-x='${previewX}'][data-y='${previewY}']`);
            cell.classList.add('preview');
        }
    }
}

function clearShipPreview() {
    var cells = document.querySelectorAll('#placementBoard .cell.preview');
    cells.forEach(cell => cell.classList.remove('preview'));
}

function submitShips() {
    var serverShips = [];
    placedShips.forEach(ship => {
        ship.cells.forEach(cell => {
            serverShips.push({
                x: cell.x,
                y: cell.y,
                name: ship.name
            });
        });
    });

    socket.send(JSON.stringify({
        type: 'placeShip',
        uid: userUID,
        ships: serverShips
    }));
    
    doneButton.disabled = true;
    disableBoard(placementBoard);
    updateStatus("Waiting for second player...");
    waitingForOpponent = true;
}

function handleSocketMessage(event) {
    var message = JSON.parse(event.data);

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
    var cell = document.querySelector(`#placementBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (cell) {
        cell.classList.add(message.hit ? 'hit' : 'miss');
        if (message.hit && message.shipName) {
            cell.setAttribute('data-ship', message.shipName);
        }
    }
}

function handleShotResult(message) {
    var cell = document.querySelector(`#shootingBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (cell) {
        cell.classList.add(message.hit ? 'hit' : 'miss');
        if (message.hit && message.shipName) {
            cell.setAttribute('data-ship', message.shipName);
            cell.setAttribute('title', message.shipName); // Hozzáadjuk a tooltip-et
        }
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

    let gameEndMessage = "";
    if (message.message.includes("won")) {
        gameEndMessage = "Congratulations, you won!";
    } else if (message.message.includes("lost")) {
        gameEndMessage = "Sorry, you lost!";
    } else {
        gameEndMessage = message.message;
    }

    waitingDiv.innerHTML = `
        <h2>Game Over</h2>
        <p>${gameEndMessage}</p>
    `;

    var backButton = document.createElement('button');
    backButton.textContent = 'Back to Main Page';
    backButton.classList.add('end-game-button');
    backButton.addEventListener('click', () => {
        navigateTo("../MAINPAGE/mainpage.html");
    });

    waitingDiv.appendChild(backButton);
    waitingDiv.style.display = 'block';

    updateStatus("<h2>Game Over</h2>");

    disableBoard(placementBoard);
    disableBoard(shootingBoard);
}

function updateStatus(message) {
    statusDiv.innerHTML = message;
}

function enableBoard(board) {
    var cells = board.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('disabled');
    });
}

function disableBoard(board) {
    var cells = board.querySelectorAll('.cell');
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
    var timerElement = waitingDiv.querySelector('.timer');
    if (timerElement) {
        timerElement.textContent = `${waitingTimer} seconds`;
    }
}

function getCookie(name) {
    var value = `; ${document.cookie}`;
    var parts = value.split(`; ${name}=`);
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
    var cookies = ["userUID", "userEmail", "loginTime"];
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

function handleShootClick(event) {
    if (!gameActive || waitingForOpponent) return;
    if (event.target.classList.contains('disabled')) return;
    
    var x = parseInt(event.target.dataset.x);
    var y = parseInt(event.target.dataset.y);
    
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

window.addEventListener('DOMContentLoaded', (event) => {
    updateStatus(`Place your ${SHIPS[0].name} (${SHIPS[0].size} cells)`);
});
