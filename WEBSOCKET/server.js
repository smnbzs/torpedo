var WebSocket = require('ws');
var mysql = require('mysql2');

var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'torpedo',
});

var wss = new WebSocket.Server({ port: 16108 });

let players = {};
let rooms = {};
let games = {};

wss.on('connection', (ws) => {
    console.log('Client connected.');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            console.log('Received message:', data); 
        } catch (e) {
            console.error('Failed to parse message or invalid message format:', message);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        if (!data.type) {
             console.error('Message received without type:', data);
             return;
        }
        if (ws.playerUid && data.uid && ws.playerUid !== data.uid) {
            console.error(`UID mismatch! Expected ${ws.playerUid}, got ${data.uid}`);
            return;
        }
        if (!ws.playerUid && data.type !== 'sendUID') {
            console.error(`Non-identified client sent message type: ${data.type}`);
             ws.send(JSON.stringify({ type: 'error', message: 'Please identify first sending your UID.' }));
            return;
        }


        switch (data.type) {
            case 'sendUID':
                handleSendUID(ws, data.uid);
                break;
            case 'placeShip':
                if (players[data.uid] && players[data.uid].roomId) {
                    handlePlaceShip(ws, data.uid, data.ships);
                } else {
                     console.error(`Player ${data.uid} tried to place ships without being in a room.`);
                }
                break;
            case 'shoot':
                 if (players[data.uid] && players[data.uid].roomId && findGameByPlayer(data.uid)) {
                     handleShoot(ws, data.uid, data.x, data.y);
                 } else {
                      console.error(`Player ${data.uid} tried to shoot outside of a game.`);
                 }
                break;
            default:
                console.log(`Received unknown message type: ${data.type}`);
                ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Client disconnected. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
        handleDisconnect(ws); 
    });

     ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        handleDisconnect(ws); 
    });

});

function handleSendUID(ws, uid) {
    if (!uid) {
        console.error("sendUID called with invalid UID.");
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid UID provided.' }));
        return;
    }
     if (ws.playerUid) {
          console.log(`WebSocket connection already associated with UID ${ws.playerUid}. Ignoring new sendUID for ${uid}.`);
          return;
     }
     if (players[uid] && players[uid].conn.readyState === WebSocket.OPEN) {
         console.warn(`Player UID ${uid} is already connected. Closing new connection.`);
         ws.send(JSON.stringify({ type: 'error', message: 'This user ID is already logged in.' }));
         ws.close(1008, "Duplicate connection");
         return;
     }

    console.log(`Associating connection with UID: ${uid}`);
    ws.playerUid = uid; 

    players[uid] = {
        conn: ws,
        uid: uid,
        roomId: null, 
        ships: [],
        shots: [],
        state: 'lobby' 
    };

    let targetRoomId = findAvailableRoom();

    if (targetRoomId) {
        var room = rooms[targetRoomId];
        console.log(`Player ${uid} joining existing room ${targetRoomId}`);
        room.players.push(uid);
        players[uid].roomId = targetRoomId;
        room.state = 'full'; 
        players[uid].state = 'matching'; 

        var otherPlayerUid = room.players.find(p => p !== uid);
         if (otherPlayerUid && players[otherPlayerUid] && players[otherPlayerUid].conn.readyState === WebSocket.OPEN) {
             players[otherPlayerUid].state = 'matching';
             players[otherPlayerUid].conn.send(JSON.stringify({ type: 'opponentJoined', message: 'Opponent found! Prepare for battle.' }));
         }

        startGame(targetRoomId);

    } else {
        targetRoomId = createRoom();
        console.log(`Player ${uid} created and joined new room ${targetRoomId}`);
        rooms[targetRoomId].players.push(uid);
        players[uid].roomId = targetRoomId;
        players[uid].state = 'waiting_opponent'; 
        ws.send(JSON.stringify({ type: 'waiting', message: 'Waiting for an opponent...' }));
    }
}

function handlePlaceShip(ws, uid, ships) {
     if (!Array.isArray(ships) || ships.length === 0) { 
         console.error(`Invalid ship data from player ${uid}:`, ships);
         ws.send(JSON.stringify({ type: 'error', message: 'Invalid ship placement data.' }));
         return;
     }

    if (!players[uid] || !players[uid].roomId) {
        console.error(`Cannot place ships for player ${uid}, not found or not in a room.`);
        return;
    }

    players[uid].ships = ships;
    players[uid].state = 'ships_placed';
    console.log(`Player ${uid} placed ships in room ${players[uid].roomId}`);

    var roomId = players[uid].roomId;
    var room = rooms[roomId];
    var gameId = room.gameId;

     var allPlayersPlacedShips = room.players.every(playerUid => players[playerUid] && players[playerUid].state === 'ships_placed');

     if (allPlayersPlacedShips) {
         console.log(`All players placed ships in room ${roomId}. Starting shooting phase for game ${gameId}.`);
         room.players.forEach(playerUid => {
              if (players[playerUid] && players[playerUid].conn.readyState === WebSocket.OPEN) {
                  players[playerUid].conn.send(JSON.stringify({ type: 'shipsPlaced', message: 'Both players placed ships. Shooting begins!' }));
                  players[playerUid].state = 'playing'; 
              }
         });
         startShootingPhase(roomId, gameId);
     } else {
          ws.send(JSON.stringify({ type: 'waiting', message: 'Ships placed. Waiting for opponent...' }));
     }
}


function handleShoot(ws, uid, x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') {
         ws.send(JSON.stringify({ type: 'error', message: 'Invalid coordinates.' }));
         return;
    }

    var gameId = findGameByPlayer(uid);
    if (!gameId || !games[gameId]) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game not active.' }));
        return;
    }
    var game = games[gameId];

    if (uid !== game.currentTurn || game.ended) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn.' }));
        return;
    }

    if (players[uid].shots.some(shot => shot.x === x && shot.y === y)) {
        ws.send(JSON.stringify({ type: 'info', message: 'You already shot this cell.' }));
        return;
    }

    var opponentUid = game.players.find(pUid => pUid !== uid);
    var hit = players[opponentUid].ships.some(ship => ship.x === x && ship.y === y);
    
    players[uid].shots.push({ x, y, hit });

    ws.send(JSON.stringify({ type: 'shotResult', x, y, hit }));

    if (players[opponentUid]?.conn.readyState === WebSocket.OPEN) {
        players[opponentUid].conn.send(JSON.stringify({ type: 'opponentShot', x, y, hit }));
    }

    var gameEnded = checkWin(gameId, uid, opponentUid);

    if (!gameEnded) {
        game.currentTurn = opponentUid;
        game.players.forEach(playerUid => {
            if (players[playerUid]?.conn.readyState === WebSocket.OPEN) {
                players[playerUid].conn.send(JSON.stringify({
                    type: 'turn',
                    yourTurn: (playerUid === game.currentTurn),
                    message: (playerUid === game.currentTurn) ? "It's your turn!" : "Opponent's turn."
                }));
            }
        });
    }
}

function startGame(roomId) {
    if (!rooms[roomId] || rooms[roomId].players.length !== 2) {
        console.error(`Cannot start game in room ${roomId}. Invalid state or player count.`);
        return;
    }
    var room = rooms[roomId];
    var playerUids = room.players;

    if (!players[playerUids[0]] || !players[playerUids[1]]) {
         console.error(`Cannot start game in room ${roomId}. Player data missing.`);
         cleanUpRoom(roomId);
         return;
    }


    var gameId = `game_${Date.now()}_${roomId}`;
    console.log(`Starting game ${gameId} in room ${roomId} for players ${playerUids.join(', ')}`);

    games[gameId] = {
        id: gameId,
        players: [...playerUids],
        currentTurn: playerUids[Math.floor(Math.random() * 2)],
        roomId: roomId,
        ended: false,
    };

    room.gameId = gameId;
    room.state = 'playing'; 

    playerUids.forEach((uid) => {
        if (players[uid] && players[uid].conn.readyState === WebSocket.OPEN) {
             players[uid].state = 'placing_ships'; 
            players[uid].conn.send(JSON.stringify({
                type: 'start',
                message: 'Game started! Place your ships.',
                gameId: gameId, 
            }));
        }
    });
}


function startShootingPhase(roomId, gameId) {
     if (!games[gameId]) {
         console.error(`Cannot start shooting phase. Game ${gameId} not found.`);
         return;
     }
     var game = games[gameId];
     var room = rooms[roomId];

     console.log(`Starting shooting phase for game ${gameId}. First turn: ${game.currentTurn}`);

     room.players.forEach(uid => {
         if (players[uid] && players[uid].conn.readyState === WebSocket.OPEN) {
            players[uid].conn.send(JSON.stringify({
                 type: 'turn',
                 yourTurn: (uid === game.currentTurn),
                 message: (uid === game.currentTurn) ? "Shooting phase begins! It's your turn." : "Shooting phase begins! Opponent's turn."
             }));
         }
     });
}


function checkWin(gameId, shooterUid, opponentUid) {
    if (!players[opponentUid] || !players[shooterUid]) return false;
    if (!games[gameId] || games[gameId].ended) return games[gameId]?.ended || true;

    var opponentShips = players[opponentUid].ships;
    var shooterShots = players[shooterUid].shots;

    if (!Array.isArray(opponentShips) || !Array.isArray(shooterShots)) return false;

    let remainingShipParts = 0;
    opponentShips.forEach(ship => {
        var isHit = shooterShots.some(shot => shot.x === ship.x && shot.y === ship.y && shot.hit);
        if (!isHit) remainingShipParts++;
    });

    if (remainingShipParts === 0 && opponentShips.length > 0) {
        endGame(gameId, shooterUid);
        return true;
    }
    return false;
}


function endGame(gameId, winnerUid) {
     if (!games[gameId]) {
         console.warn(`Attempted to end non-existent game ${gameId}`);
         return;
     }
     if (games[gameId].ended) {
         console.log(`Game ${gameId} was already marked as ended.`);
         return;
     }

     console.log(`\n--- Ending game ${gameId}. Winner: ${winnerUid} ---`);

     var game = games[gameId];
     game.ended = true;

     var playerUids = game.players;
     var roomId = game.roomId;

     playerUids.forEach(playerUid => {
          var isWinner = String(playerUid) === String(winnerUid);
         var messageToSend = isWinner ? 'You won!' : 'You lost!';

         console.log(`Game ${gameId}: Preparing 'end' message for player ${playerUid}. Is winner: ${isWinner}`);

         if (players[playerUid] && players[playerUid].conn && players[playerUid].conn.readyState === WebSocket.OPEN) {
             try {
                 players[playerUid].conn.send(JSON.stringify({
                     type: 'end',
                     message: messageToSend,
                 }));
                 console.log(`Game ${gameId}: Sent 'end' message to ${playerUid}: "${messageToSend}"`);
                  players[playerUid].state = 'game_over';
             } catch (error) {
                 console.error(`ERROR: Failed to send 'end' message to ${playerUid} in game ${gameId}:`, error);
             }
         } else {
             console.warn(`WARN: Could not send 'end' message to player ${playerUid} (player/connection missing or closed).`);
         }
     });

     setTimeout(() => {
         console.log(`Cleaning up resources for ended game ${gameId} and room ${roomId}`);
          delete games[gameId];
          if (rooms[roomId]) {
              delete rooms[roomId];
          }
          playerUids.forEach(uid => {
              if (players[uid]) {
                  players[uid].roomId = null;
                   players[uid].gameId = null;
                   players[uid].ships = [];
                   players[uid].shots = [];
                   players[uid].state = 'lobby';
                   console.log(`Player ${uid} state reset to lobby after game end.`);
              }
          });
     }, 500); // 0.5 másodperc várakozás a takarítás előtt
}


function handleDisconnect(ws) {
    var disconnectedUid = ws.playerUid;

    if (!disconnectedUid || !players[disconnectedUid]) {
        console.log("Disconnecting client was not fully identified or already cleaned up.");
        return;
    }

    console.log(`Handling disconnect for player ${disconnectedUid}`);

    var player = players[disconnectedUid];
    var roomId = player.roomId;

    delete players[disconnectedUid];
    console.log(`Removed player ${disconnectedUid} from players list.`);

    if (roomId && rooms[roomId]) {
        var room = rooms[roomId];
        var gameId = room.gameId;

        console.log(`Player ${disconnectedUid} was in room ${roomId}. Notifying opponent and cleaning up.`);

        var opponentUid = room.players.find(pUid => pUid !== disconnectedUid);

        if (opponentUid && players[opponentUid] && players[opponentUid].conn.readyState === WebSocket.OPEN) {
            console.log(`Notifying opponent ${opponentUid} about disconnection and declaring them as winner.`);
            
            // Ha már van aktív játék, akkor fejezzük be győzelemmel
            if (gameId && games[gameId] && !games[gameId].ended) {
                endGame(gameId, opponentUid);
            } else {
                // Ha még nem kezdődött el a játék, egyszerűen csak értesítjük
                players[opponentUid].conn.send(JSON.stringify({
                    type: 'gameOver',
                    message: 'Your opponent has disconnected. You win!'
                }));
            }

            players[opponentUid].roomId = null;
            players[opponentUid].gameId = null;
            players[opponentUid].ships = [];
            players[opponentUid].shots = [];
            players[opponentUid].state = 'lobby';
        } else if (opponentUid) {
            console.log(`Opponent ${opponentUid} is not available or already disconnected.`);
            if (players[opponentUid]) {
                delete players[opponentUid];
                console.log(`Removed unavailable opponent ${opponentUid} from players list.`);
            }
        }

        if (gameId && games[gameId]) {
            console.log(`Deleting game ${gameId} due to player disconnect.`);
            delete games[gameId];
        }

        delete rooms[roomId];
        console.log(`Deleted room ${roomId}.`);

    } else {
        console.log(`Player ${disconnectedUid} was not in an active room.`);
    }
}


function createRoom() {
    var roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    rooms[roomId] = {
         id: roomId,
         players: [],
         gameId: null,
         state: 'waiting'
    };
    return roomId;
}

function findRoomByPlayer(uid) {
    return Object.keys(rooms).find(roomId => rooms[roomId] && rooms[roomId].players.includes(uid)) || null;
}

function findAvailableRoom() {
    return Object.keys(rooms).find(roomId => rooms[roomId] && rooms[roomId].state === 'waiting' && rooms[roomId].players.length === 1) || null;
}

function findGameByPlayer(uid) {
    return Object.keys(games).find(gameId => games[gameId] && !games[gameId].ended && games[gameId].players.includes(uid)) || null;
}

function cleanUpRoom(roomId) {
     if (!rooms[roomId]) return;
     console.warn(`Cleaning up potentially problematic room ${roomId}`);
     var room = rooms[roomId];
     var gameId = room.gameId;
     var playerUids = room.players;

     if (gameId && games[gameId]) {
          delete games[gameId];
     }
     playerUids.forEach(uid => {
          if (players[uid]) {
               players[uid].roomId = null;
               players[uid].gameId = null;
               players[uid].state = 'lobby';
                if (players[uid].conn.readyState === WebSocket.OPEN) {
                     players[uid].conn.send(JSON.stringify({ type: 'info', message: 'The room was closed due to an error.' }));
                }
          }
     });
     delete rooms[roomId];
}

console.log(`Server logic initialized. Waiting for connections on ws://localhost:16108`);
