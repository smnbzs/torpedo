const WebSocket = require('ws');
const mysql = require('mysql2'); // Bár a kódban nincs MySQL interakció, meghagyom a kapcsolatot

// --- Adatbázis Kapcsolat (ha később szükséges) ---
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'torpedo',
});

connection.connect((err) => {
    if (err) {
        console.error('Database connection error: ' + err.stack);
        // Lehet, hogy itt le kellene állítani a szervert, ha az adatbázis kritikus
        // process.exit(1);
        return;
    }
    console.log('Connected to MySQL as id ' + connection.threadId);
});

// --- WebSocket Szerver Indítása ---
const wss = new WebSocket.Server({ port: 16108 });
console.log('WebSocket server started on port 16108');

// --- Adatstruktúrák ---
let players = {}; // uid -> { conn, uid, roomId, ships, shots, state }
let rooms = {};   // roomId -> { id, players: [uid1, uid2], gameId, state: 'waiting' | 'playing' | 'full' }
let games = {};   // gameId -> { id, players: [uid1, uid2], currentTurn, roomId, ended: false }

// --- WebSocket Kapcsolat Kezelése ---
wss.on('connection', (ws) => {
    console.log('Client connected.');

    // --- Üzenet Kezelése ---
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            console.log('Received message:', data); // Log üzenet tartalmát
        } catch (e) {
            console.error('Failed to parse message or invalid message format:', message);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        // Ellenőrizzük, hogy van-e type és uid (kivéve a legelső 'sendUID' esetén)
        if (!data.type) {
             console.error('Message received without type:', data);
             return;
        }
        // Ha a játékos már azonosított, ellenőrizzük az UID egyezést
        if (ws.playerUid && data.uid && ws.playerUid !== data.uid) {
            console.error(`UID mismatch! Expected ${ws.playerUid}, got ${data.uid}`);
            // Lehet, hogy itt bontani kellene a kapcsolatot vagy hibát küldeni
            return;
        }
        // Ha még nincs azonosítva, és nem 'sendUID' az üzenet, akkor hiba
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
                 // Ellenőrizzük, hogy a játékos létezik-e és van-e szobája
                if (players[data.uid] && players[data.uid].roomId) {
                    handlePlaceShip(ws, data.uid, data.ships);
                } else {
                     console.error(`Player ${data.uid} tried to place ships without being in a room.`);
                }
                break;
            case 'shoot':
                 // Ellenőrizzük, hogy a játékos létezik-e és van-e szobája/játéka
                 if (players[data.uid] && players[data.uid].roomId && findGameByPlayer(data.uid)) {
                     handleShoot(ws, data.uid, data.x, data.y);
                 } else {
                      console.error(`Player ${data.uid} tried to shoot outside of a game.`);
                 }
                break;
            // Esetleges további üzenettípusok (pl. 'chat', 'rematch_request')
            default:
                console.log(`Received unknown message type: ${data.type}`);
                ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
        }
    });

    // --- Kapcsolat Bontás Kezelése ---
    ws.on('close', (code, reason) => {
        console.log(`Client disconnected. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
        handleDisconnect(ws); // Átadja a WebSocket kapcsolatot a kezelőnek
    });

    // --- WebSocket Hiba Kezelése ---
     ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        // A 'close' esemény általában ezután is lefut, ott történik a takarítás
        handleDisconnect(ws); // Megpróbáljuk itt is a takarítást
    });

});

// --- Játékos Azonosítás és Szobába Helyezés ---
function handleSendUID(ws, uid) {
    if (!uid) {
        console.error("sendUID called with invalid UID.");
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid UID provided.' }));
        return;
    }
     // Ha ez a ws kapcsolat már hozzá van rendelve egy UID-hoz (pl. újraküldi), ne csináljunk semmit
     if (ws.playerUid) {
          console.log(`WebSocket connection already associated with UID ${ws.playerUid}. Ignoring new sendUID for ${uid}.`);
          return;
     }
     // Ha ez az UID már aktív egy másik kapcsolattal, jelezzük a problémát
     if (players[uid] && players[uid].conn.readyState === WebSocket.OPEN) {
         console.warn(`Player UID ${uid} is already connected. Closing new connection.`);
         ws.send(JSON.stringify({ type: 'error', message: 'This user ID is already logged in.' }));
         ws.close(1008, "Duplicate connection"); // Policy Violation
         return;
     }

    console.log(`Associating connection with UID: ${uid}`);
    ws.playerUid = uid; // Tároljuk a UID-t a ws objektumon a későbbi azonosításhoz

    // Hozzáadjuk vagy frissítjük a játékost a globális listában
    players[uid] = {
        conn: ws,
        uid: uid,
        roomId: null, // Kezdetben nincs szobában
        ships: [],
        shots: [],
        state: 'lobby' // Kezdeti állapot
    };

    // Keressünk egy várakozó szobát, vagy hozzunk létre újat
    let targetRoomId = findAvailableRoom();

    if (targetRoomId) {
        // Találtunk várakozó szobát, csatlakozzunk hozzá
        const room = rooms[targetRoomId];
        console.log(`Player ${uid} joining existing room ${targetRoomId}`);
        room.players.push(uid);
        players[uid].roomId = targetRoomId;
        room.state = 'full'; // Szoba betelt
        players[uid].state = 'matching'; // Játékos állapota

        // Értesítsük a másik játékost is (ha van kapcsolata)
        const otherPlayerUid = room.players.find(p => p !== uid);
         if (otherPlayerUid && players[otherPlayerUid] && players[otherPlayerUid].conn.readyState === WebSocket.OPEN) {
             players[otherPlayerUid].state = 'matching';
             players[otherPlayerUid].conn.send(JSON.stringify({ type: 'opponentJoined', message: 'Opponent found! Prepare for battle.' }));
         }

        // Indítsuk el a játékot, mivel a szoba betelt
        startGame(targetRoomId);

    } else {
        // Nincs várakozó szoba, hozzunk létre egy újat
        targetRoomId = createRoom();
        console.log(`Player ${uid} created and joined new room ${targetRoomId}`);
        rooms[targetRoomId].players.push(uid);
        players[uid].roomId = targetRoomId;
        players[uid].state = 'waiting_opponent'; // Játékos állapota

        // Értesítsük a játékost, hogy várakozik
        ws.send(JSON.stringify({ type: 'waiting', message: 'Waiting for an opponent...' }));
    }
}

// --- Hajók Elhelyezése ---
function handlePlaceShip(ws, uid, ships) {
     // Validálás (alap szintű)
     if (!Array.isArray(ships) || ships.length === 0) { // Vagy ellenőrizhetnénk a hajók számát is
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

    const roomId = players[uid].roomId;
    const room = rooms[roomId];
    const gameId = room.gameId; // Szerezzük meg a gameId-t a szobából

     // Ellenőrizzük, hogy mindkét játékos elhelyezte-e a hajóit
     const allPlayersPlacedShips = room.players.every(playerUid => players[playerUid] && players[playerUid].state === 'ships_placed');

     if (allPlayersPlacedShips) {
         console.log(`All players placed ships in room ${roomId}. Starting shooting phase for game ${gameId}.`);
         // Értesítés mindkét játékosnak (opcionális, de jó visszajelzés)
         room.players.forEach(playerUid => {
              if (players[playerUid] && players[playerUid].conn.readyState === WebSocket.OPEN) {
                  players[playerUid].conn.send(JSON.stringify({ type: 'shipsPlaced', message: 'Both players placed ships. Shooting begins!' }));
                  players[playerUid].state = 'playing'; // Játékos állapot frissítése
              }
         });
         // Indítsd el a lövöldözési fázist
         startShootingPhase(roomId, gameId);
     } else {
          // Értesítsd a játékost, hogy várunk a másikra
          ws.send(JSON.stringify({ type: 'waiting', message: 'Ships placed. Waiting for opponent...' }));
          // A másik játékos még nem végzett, neki nem kell küldeni semmit itt
     }
}


// --- Lövés Kezelése ---
function handleShoot(ws, uid, x, y) {
    // Validálás (alap szintű)
    if (typeof x !== 'number' || typeof y !== 'number' /* || x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE */) {
         console.error(`Invalid shoot coordinates from player ${uid}: (${x}, ${y})`);
         ws.send(JSON.stringify({ type: 'error', message: 'Invalid coordinates.' }));
         return;
    }

    const gameId = findGameByPlayer(uid);
    if (!gameId || !games[gameId]) {
        console.error(`Game not found for shooting player ${uid}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Game not active.' }));
        return;
    }
    const game = games[gameId];

    // Ellenőrizd, hogy a játékos van-e soron
    if (uid !== game.currentTurn) {
        console.log(`Player ${uid} tried to shoot out of turn in game ${gameId}. Current turn: ${game.currentTurn}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn.' }));
        return;
    }

    // Ellenőrizd, hogy a játék véget ért-e már
    if (game.ended) {
         console.log(`Player ${uid} tried to shoot in already ended game ${gameId}.`);
         ws.send(JSON.stringify({ type: 'error', message: 'Game has already ended.' }));
         return;
    }

    // Ellenőrizd, hogy ezt a cellát lőtték-e már
    if (players[uid].shots.some(shot => shot.x === x && shot.y === y)) {
        console.log(`Player ${uid} tried to shoot the same cell [${x},${y}] again in game ${gameId}.`);
        ws.send(JSON.stringify({ type: 'info', message: 'You already shot this cell.' })); // Csak infó, nem hiba
        return; // Már lőtte ezt a mezőt
    }

    const opponentUid = game.players.find(pUid => pUid !== uid);
    if (!opponentUid || !players[opponentUid]) {
        console.error(`Opponent data missing for shooting player ${uid} in game ${gameId}`);
        // Itt lehet, hogy le kellene zárni a játékot, mert súlyos hiba van
        // endGameWithError(gameId, "Opponent data missing.");
        return;
    }

    // Ellenőrizd a találatot az ellenfél hajóin
    const hit = players[opponentUid].ships.some(ship => ship.x === x && ship.y === y);
    console.log(`Player ${uid} shoots at [${x},${y}] in game ${gameId}. Hit: ${hit}`);

    // Rögzítsd a lövést a lövő játékosnál
    players[uid].shots.push({ x, y, hit });

    // Küldd el a lövés eredményét a lövő játékosnak
    ws.send(JSON.stringify({
        type: 'shotResult',
        x: x,
        y: y,
        hit: hit,
    }));

    // Ellenőrizd a győzelmet
    const gameEnded = checkWin(gameId, uid, opponentUid); // uid a lövő (shooter)

    // Csak akkor add át a kört, ha a játék NEM ért véget ezzel a lövéssel
    if (!gameEnded) {
        game.currentTurn = opponentUid; // Következő játékos beállítása
        console.log(`Game ${gameId}: Turn passes to ${opponentUid}`);

        // Küldd el a kör információt mindkét játékosnak
        game.players.forEach(playerUid => {
            if (players[playerUid] && players[playerUid].conn.readyState === WebSocket.OPEN) {
                players[playerUid].conn.send(JSON.stringify({
                    type: 'turn',
                    yourTurn: (playerUid === game.currentTurn), // Igaz, ha az adott játékos jön
                    message: (playerUid === game.currentTurn) ? "It's your turn!" : "Opponent's turn."
                }));
            }
        });
    }
    // Ha a gameEnded igaz, akkor a checkWin már meghívta az endGame-et,
    // és az endGame küldte el a 'end' üzeneteket. Nem kell 'turn'-t küldeni.
}

// --- Játék Indítása ---
function startGame(roomId) {
    if (!rooms[roomId] || rooms[roomId].players.length !== 2) {
        console.error(`Cannot start game in room ${roomId}. Invalid state or player count.`);
        return;
    }
    const room = rooms[roomId];
    const playerUids = room.players;

    // Ellenőrizzük, hogy mindkét játékos adatai megvannak-e
    if (!players[playerUids[0]] || !players[playerUids[1]]) {
         console.error(`Cannot start game in room ${roomId}. Player data missing.`);
         // Lehet, hogy itt le kell takarítani a szobát
         cleanUpRoom(roomId);
         return;
    }


    const gameId = `game_${Date.now()}_${roomId}`; // Egyedi gameId generálása
    console.log(`Starting game ${gameId} in room ${roomId} for players ${playerUids.join(', ')}`);

    // Játék objektum létrehozása
    games[gameId] = {
        id: gameId,
        players: [...playerUids], // Másolat készítése
        currentTurn: playerUids[Math.floor(Math.random() * 2)], // Véletlenszerű kezdő játékos
        roomId: roomId,
        ended: false,
    };

    // GameId tárolása a szobában is
    room.gameId = gameId;
    room.state = 'playing'; // Szoba állapota játékra vált

    // Értesítés a játékosoknak a játék indulásáról és a hajók elhelyezéséről
    playerUids.forEach((uid) => {
        if (players[uid] && players[uid].conn.readyState === WebSocket.OPEN) {
             players[uid].state = 'placing_ships'; // Játékos állapota
            players[uid].conn.send(JSON.stringify({
                type: 'start',
                message: 'Game started! Place your ships.',
                gameId: gameId, // Opcionális: elküldhetjük a gameId-t is
                // A yourTurn itt még nem releváns, mert a hajóelhelyezés van
            }));
        }
    });
}


// --- Lövöldözési Fázis Indítása ---
function startShootingPhase(roomId, gameId) {
     if (!games[gameId]) {
         console.error(`Cannot start shooting phase. Game ${gameId} not found.`);
         return;
     }
     const game = games[gameId];
     const room = rooms[roomId];

     console.log(`Starting shooting phase for game ${gameId}. First turn: ${game.currentTurn}`);

     // Értesítsd a játékosokat, hogy ki kezd
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


// --- Győzelem Ellenőrzése ---
function checkWin(gameId, shooterUid, opponentUid) {
     // Ellenőrzések
     if (!players[opponentUid] || !players[shooterUid]) {
         console.error(`Player data missing in checkWin for game ${gameId}`);
         return false; // Nem tudjuk ellenőrizni
     }
     if (!games[gameId] || games[gameId].ended) {
          // Ha a játék nem létezik, vagy már véget ért, akkor nem történhetett győzelem most
         return games[gameId] ? games[gameId].ended : true;
     }

     const opponentShips = players[opponentUid].ships;
     const shooterShots = players[shooterUid].shots; // A lövő játékos eddigi lövései

     // Validáljuk, hogy vannak-e hajók és lövések (paranoia check)
     if (!Array.isArray(opponentShips) || !Array.isArray(shooterShots)) {
          console.error(`Invalid ships or shots data in checkWin for game ${gameId}`);
          return false;
     }

     // Számoljuk meg az ellenfél hajóinak azon részeit, amelyeket MÉG NEM találtak el
     let remainingShipParts = 0;
     opponentShips.forEach(ship => {
         // Ellenőrizzük, hogy az adott hajó pozícióját eltalálta-e már egy 'hit' lövés
         const isHit = shooterShots.some(shot => shot.x === ship.x && shot.y === ship.y && shot.hit);
         if (!isHit) {
             remainingShipParts++;
         }
     });

     console.log(`Game ${gameId}: Player ${opponentUid} has ${remainingShipParts} remaining ship parts.`);

     // Ha nincs több eltalálatlan hajórész, a lövő nyert
     if (remainingShipParts === 0 && opponentShips.length > 0) { // Kell legalább egy hajó, hogy nyerni lehessen
         console.log(`Game ${gameId}: Win condition met for shooter ${shooterUid}.`);
         endGame(gameId, shooterUid); // Meghívjuk a játék végét a győztessel
         return true; // Jelzi, hogy a játék véget ért
     }

     return false; // A játék folytatódik
}


// --- Játék Befejezése ---
function endGame(gameId, winnerUid) {
     if (!games[gameId]) {
         console.warn(`Attempted to end non-existent game ${gameId}`);
         return;
     }
     // Ha már véget ért, ne csináljunk semmit (dupla hívás elkerülése)
     if (games[gameId].ended) {
         console.log(`Game ${gameId} was already marked as ended.`);
         return;
     }

     console.log(`\n--- Ending game ${gameId}. Winner: ${winnerUid} ---`);

     const game = games[gameId];
     game.ended = true; // Jelöljük befejezettként AZONNAL

     const playerUids = game.players;
     const roomId = game.roomId;

     // Küldjük el az 'end' üzenetet mindkét játékosnak
     playerUids.forEach(playerUid => {
          // Használjuk a String() konverziót a biztonság kedvéért az összehasonlításnál
         const isWinner = String(playerUid) === String(winnerUid);
         const messageToSend = isWinner ? 'You won!' : 'You lost!';

         console.log(`Game ${gameId}: Preparing 'end' message for player ${playerUid}. Is winner: ${isWinner}`);

         if (players[playerUid] && players[playerUid].conn && players[playerUid].conn.readyState === WebSocket.OPEN) {
             try {
                 players[playerUid].conn.send(JSON.stringify({
                     type: 'end',
                     message: messageToSend,
                 }));
                 console.log(`Game ${gameId}: Sent 'end' message to ${playerUid}: "${messageToSend}"`);
                  // Frissítsük a játékos állapotát is
                  players[playerUid].state = 'game_over';
             } catch (error) {
                 console.error(`ERROR: Failed to send 'end' message to ${playerUid} in game ${gameId}:`, error);
             }
         } else {
             console.warn(`WARN: Could not send 'end' message to player ${playerUid} (player/connection missing or closed).`);
         }
     });

     // --- Játék és Szoba Takarítása ---
     // Kis késleltetés adhat időt az üzenetek biztos célba érésére a törlés előtt
     setTimeout(() => {
         console.log(`Cleaning up resources for ended game ${gameId} and room ${roomId}`);
          // Játék törlése
          delete games[gameId];
          // Szoba törlése
          if (rooms[roomId]) {
              delete rooms[roomId];
          }
          // Játékosok szoba ID-jának és állapotának nullázása (vagy törlése a players listából)
          // Most csak a roomId-t nullázzuk, hogy a kapcsolat megmaradjon, de jelezzük, hogy nincs szobában
          playerUids.forEach(uid => {
              if (players[uid]) {
                  players[uid].roomId = null;
                   players[uid].gameId = null; // Biztonság kedvéért
                   players[uid].ships = []; // Hajók törlése
                   players[uid].shots = []; // Lövések törlése
                   players[uid].state = 'lobby'; // Vissza a lobby állapotba
                   console.log(`Player ${uid} state reset to lobby after game end.`);
              }
          });
     }, 500); // 0.5 másodperc várakozás a takarítás előtt
}


// --- Kapcsolat Bontásának Kezelése ---
function handleDisconnect(ws) {
    const disconnectedUid = ws.playerUid; // A ws objektumon tárolt UID alapján azonosítunk

    if (!disconnectedUid || !players[disconnectedUid]) {
        console.log("Disconnecting client was not fully identified or already cleaned up.");
        return; // Nem volt azonosított játékos, vagy már kezeltük
    }

    console.log(`Handling disconnect for player ${disconnectedUid}`);

    const player = players[disconnectedUid];
    const roomId = player.roomId;

    // Töröljük a játékost a globális listából
    delete players[disconnectedUid];
    console.log(`Removed player ${disconnectedUid} from players list.`);

    // Ha a játékos szobában volt
    if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const gameId = room.gameId;

        console.log(`Player ${disconnectedUid} was in room ${roomId}. Notifying opponent and cleaning up.`);

        // Keressük meg a másik játékost a szobában
        const opponentUid = room.players.find(pUid => pUid !== disconnectedUid);

        // Értesítsük az ellenfelet (ha van és még kapcsolódva van)
        if (opponentUid && players[opponentUid] && players[opponentUid].conn.readyState === WebSocket.OPEN) {
             console.log(`Notifying opponent ${opponentUid} about disconnection.`);
             players[opponentUid].conn.send(JSON.stringify({
                 type: 'opponentLeft',
                 message: 'Your opponent has disconnected. The game has ended.'
             }));
             // Az ellenfél állapotának visszaállítása
              players[opponentUid].roomId = null;
              players[opponentUid].gameId = null;
              players[opponentUid].ships = [];
              players[opponentUid].shots = [];
              players[opponentUid].state = 'lobby'; // Vissza a lobbyba
              console.log(`Opponent ${opponentUid} state reset to lobby due to disconnect.`);
        } else if (opponentUid) {
              console.log(`Opponent ${opponentUid} is not available or already disconnected.`);
              // Ha az ellenfél is lecsatlakozott már, őt is törölhetjük a players listából
              if (players[opponentUid]) {
                   delete players[opponentUid];
                   console.log(`Removed unavailable opponent ${opponentUid} from players list.`);
              }
        }

        // Takarítsuk el a játékot, ha volt
        if (gameId && games[gameId]) {
            console.log(`Deleting game ${gameId} due to player disconnect.`);
            // Nem kell az endGame-et hívni, mert az üzenetet már elküldtük
            delete games[gameId];
        }

        // Takarítsuk el a szobát
        delete rooms[roomId];
        console.log(`Deleted room ${roomId}.`);

    } else {
        console.log(`Player ${disconnectedUid} was not in an active room.`);
    }
}


// --- Segédfüggvények ---

// Új szoba létrehozása
function createRoom() {
    // Egyedi szoba ID generálása (biztonságosabb módszer is lehetne)
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    rooms[roomId] = {
         id: roomId,
         players: [],
         gameId: null,
         state: 'waiting' // Kezdetben várakozik játékosra
        };
    console.log(`Room ${roomId} created.`);
    return roomId;
}

// Játékoshoz tartozó szoba keresése
function findRoomByPlayer(uid) {
    // Végigmegy a szobákon és visszaadja az ID-t, ha a játékos benne van
    return Object.keys(rooms).find(roomId => rooms[roomId] && rooms[roomId].players.includes(uid)) || null;
}

// Várakozó (nem teli) szoba keresése
function findAvailableRoom() {
    // Végigmegy a szobákon és visszaadja az elsőt, ami 'waiting' állapotban van és csak 1 játékos van benne
    return Object.keys(rooms).find(roomId => rooms[roomId] && rooms[roomId].state === 'waiting' && rooms[roomId].players.length === 1) || null;
}

// Játékoshoz tartozó játék keresése
function findGameByPlayer(uid) {
    // Végigmegy a játékokon és visszaadja az ID-t, ha a játékos benne van és a játék nem ért véget
    // Figyelem: Ez feltételezi, hogy egy játékos egyszerre csak egy játékban lehet
    return Object.keys(games).find(gameId => games[gameId] && !games[gameId].ended && games[gameId].players.includes(uid)) || null;
}

// Szoba erőforrásainak felszabadítása (ha szükséges lenne külön hívni)
function cleanUpRoom(roomId) {
     if (!rooms[roomId]) return;
     console.warn(`Cleaning up potentially problematic room ${roomId}`);
     const room = rooms[roomId];
     const gameId = room.gameId;
     const playerUids = room.players;

     // Játék törlése
     if (gameId && games[gameId]) {
          delete games[gameId];
     }
     // Játékosok állapotának visszaállítása
     playerUids.forEach(uid => {
          if (players[uid]) {
               players[uid].roomId = null;
               players[uid].gameId = null;
               players[uid].state = 'lobby';
                // Értesíthetjük is őket, ha még online vannak
                if (players[uid].conn.readyState === WebSocket.OPEN) {
                     players[uid].conn.send(JSON.stringify({ type: 'info', message: 'The room was closed due to an error.' }));
                }
          }
     });
     // Szoba törlése
     delete rooms[roomId];
}

// --- Szerver futásának jelzése ---
console.log(`Server logic initialized. Waiting for connections on ws://localhost:16108`);

// Opcionális: Periodikus takarítás (pl. üres szobák, inaktív kapcsolatok ellenőrzése)
// setInterval(() => {
//     console.log("Running periodic cleanup check...");
//     // Implement logic to find and clean up stale rooms, games, or player entries
// }, 600000); // Pl. 10 percenként