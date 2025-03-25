const WebSocket = require('ws');
const mysql = require('mysql2');

// Database connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'torpedo',
});

connection.connect((err) => {
  if (err) {
    console.error('Database connection error: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL as id ' + connection.threadId);
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: 16108 });

let players = {}; // stores player data
let rooms = {}; // stores game rooms
let games = {}; // stores game state

wss.on('connection', (ws) => {
  console.log('New connection established');

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'sendUID':
        handleSendUID(ws, data.uid);
        break;
      case 'placeShip':
        handlePlaceShip(ws, data.uid, data.ships);
        break;
      case 'shoot':
        handleShoot(ws, data.uid, data.x, data.y);
        break;
      default:
        console.log('Unknown message type: ' + data.type);
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
    // Clean up player and room state when a connection is closed
  });

  ws.on('error', (err) => {
    console.error('WebSocket error: ' + err);
  });
});

function handleSendUID(ws, uid) {
  let roomId = findRoomByPlayer(uid);
  if (roomId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'You are already in a room.',
    }));
    return;
  }

  roomId = findAvailableRoom() || createRoom();
  rooms[roomId].players.push(uid);
  players[uid] = {
    conn: ws,
    ships: [],
    shots: [],
    roomId: roomId,
  };

  console.log(`#${roomId} room (players: ${rooms[roomId].players.length}/2)`);

  ws.send(JSON.stringify({
    type: 'waiting',
    message: 'Waiting for the second player...',
  }));

  if (rooms[roomId].players.length === 2) {
    startGame(roomId);
  }
}

function handlePlaceShip(ws, uid, ships) {
  if (!players[uid]) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Player not found!',
    }));
    return;
  }

  players[uid].ships = ships;

  // Check if both players have placed all ships
  if (Object.values(players).every(player => player.ships.length === 10)) {
    Object.keys(players).forEach((playerUid) => {
      players[playerUid].conn.send(JSON.stringify({
        type: 'shipsPlaced',
        message: 'Both players have placed their ships. The game begins!',
      }));
    });

    startShootingPhase();
  }
}

function handleShoot(ws, uid, x, y) {
  if (!players[uid]) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Player not found!',
    }));
    return;
  }

  const gameId = findGameByPlayer(uid);
  if (!gameId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found!',
    }));
    return;
  }

  const game = games[gameId];
  if (uid !== game.currentTurn) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'It is not your turn!',
    }));
    return;
  }

  const opponentUid = (uid === game.players[0]) ? game.players[1] : game.players[0];
  const hit = players[opponentUid].ships.some(ship => ship.x === x && ship.y === y);

  players[uid].shots.push({ x, y, hit });

  ws.send(JSON.stringify({
    type: 'shotResult',
    x: x,
    y: y,
    hit: hit,
  }));

  checkWin(opponentUid);

  // Switch turn
  game.currentTurn = opponentUid;
  games[gameId] = game;

  // Notify players of the new turn
  Object.values(players).forEach((player) => {
    player.conn.send(JSON.stringify({
      type: 'turn',
      yourTurn: (player.uid === game.currentTurn),
    }));
  });
}

function startGame(roomId) {
  const playerUids = rooms[roomId].players;
  const gameId = Date.now().toString(); // Generate a unique game ID

  games[gameId] = {
    players: playerUids,
    currentTurn: playerUids[0],
    roomId: roomId,
    ended: false,
  };

  playerUids.forEach((uid) => {
    players[uid].conn.send(JSON.stringify({
      type: 'start',
      message: 'The game has started! Place your ships.',
      yourTurn: (uid === games[gameId].currentTurn),
    }));
  });
}

function startShootingPhase() {
  const gameId = Object.keys(games)[0]; // get the first game
  Object.keys(players).forEach((uid) => {
    players[uid].conn.send(JSON.stringify({
      type: 'turn',
      yourTurn: (uid === games[gameId].currentTurn),
    }));
  });
}

function checkWin(opponentUid) {
  const opponentShips = players[opponentUid].ships;
  const currentTurnUid = games[Object.keys(games).pop()].currentTurn;

  const remainingShips = opponentShips.filter(ship => !players[currentTurnUid].shots.some(shot => shot.x === ship.x && shot.y === ship.y && shot.hit));

  if (remainingShips.length === 0) {
    endGame(currentTurnUid);
  }
}

function endGame(winnerUid) {
  const gameId = Object.keys(games).pop();
  games[gameId].ended = true;

  Object.values(players).forEach((player) => {
    player.conn.send(JSON.stringify({
      type: 'end',
      message: (player.uid === winnerUid) ? 'You won!' : 'You lost!',
    }));
  });

  saveMatchResult(winnerUid);
}

function saveMatchResult(winnerUid) {
  const gameId = Object.keys(games).pop();
  const game = games[gameId];
  const [player1Uid, player2Uid] = game.players;
  
  const player1Hits = players[player1Uid].shots.filter(shot => shot.hit).length;
  const player2Hits = players[player2Uid].shots.filter(shot => shot.hit).length;

  const duration = 10; // game duration (arbitrary)

  connection.query(
    'INSERT INTO matches (match_date, player1_id, player2_id, winner_id, player1_hits, player2_hits, duration) VALUES (NOW(), ?, ?, ?, ?, ?, ?)',
    [player1Uid, player2Uid, winnerUid, player1Hits, player2Hits, duration],
    (err, results) => {
      if (err) {
        console.error('Error saving match result: ', err);
      } else {
        console.log('Match result saved successfully');
      }
    }
  );
}

// Helper functions for room and game management
function createRoom() {
  const roomId = Object.keys(rooms).length + 1;
  rooms[roomId] = { players: [] };
  console.log(`#${roomId} room created`);
  return roomId;
}

function findRoomByPlayer(uid) {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.players.includes(uid)) {
      return roomId;
    }
  }
  return null;
}

function findAvailableRoom() {
  return Object.keys(rooms).find((roomId) => rooms[roomId].players.length < 2);
}

function findGameByPlayer(uid) {
  for (const [gameId, game] of Object.entries(games)) {
    if (game.players.includes(uid)) {
      return gameId;
    }
  }
  return null;
}
