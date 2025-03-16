const socket = new WebSocket('ws://127.0.0.1:5500');
const placementBoard = document.getElementById('placementBoard');
const shootingBoard = document.getElementById('shootingBoard');
const statusDiv = document.getElementById('status');
const doneButton = document.getElementById('doneButton');

let ships = [];
let shipsPlaced = 0;


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


function handleShootClick(event) {
    const x = parseInt(event.target.dataset.x);
    const y = parseInt(event.target.dataset.y);

   
    socket.send(JSON.stringify({ type: 'shoot', x: x, y: y }));
}


doneButton.addEventListener('click', function() {
    socket.send(JSON.stringify({ type: 'placeShip', ships: ships }));
    doneButton.disabled = true;
    statusDiv.textContent = "Várakozás a második játékosra...";
});


socket.onopen = function(event) {
    console.log("WebSocket kapcsolat létrejött!");
};

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
    }
};


function handleShotResult(message) {
    const cell = document.querySelector(`#shootingBoard .cell[data-x='${message.x}'][data-y='${message.y}']`);
    if (message.hit) {
        cell.classList.add('hit');
    } else {
        cell.classList.add('miss');
    }
}


function handleGameEnd(message) {
    statusDiv.innerHTML = "<h2>Meccs véget ért</h2>";

    
    const cells = document.querySelectorAll('#shootingBoard .cell');
    cells.forEach(cell => {
        cell.removeEventListener('click', handleShootClick);
    });

    setTimeout(() => {
        alert(message.message, window.location.href = "../LOGIN/login.html" ); 
    }, 1500);
}