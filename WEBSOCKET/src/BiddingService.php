<?php
namespace Sim\Websocket;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Exception;
use mysqli;

class BiddingService implements MessageComponentInterface {
    protected $clients;
    protected $games = [];
    protected $players = []; 
    protected $conn; 
    protected $rooms = [];

    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->games = [];
        $this->players = [];
        $this->rooms = [];

        $server = "localhost";
        $username = "root";
        $password = "";
        $database = "torpedo";

        $this->conn = new mysqli($server, $username, $password, $database);

        if ($this->conn->connect_error) {
            die("Adatbázis kapcsolódási hiba: " . $this->conn->connect_error);
        }
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "Új kapcsolat létrejött: {$conn->resourceId}\n";

        $conn->send(json_encode([
            "type" => "requestUID",
            "message" => "Kérjük, küldje el a Firebase UID-t.",
        ]));
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);

        if ($data['type'] == 'sendUID') {
            $uid = $data['uid'];

            $roomId = $this->findRoomByPlayer($uid);
            if ($roomId !== null) {
                $this->sendToPlayer($uid, [
                    "type" => "error",
                    "message" => "Már csatlakoztál egy szobához.",
                ]);
                return;
            }

            $roomId = $this->findAvailableRoom();
            if ($roomId === null) {
                $roomId = $this->createRoom();
            }

            $this->rooms[$roomId]['players'][] = $uid;
            $this->players[$uid] = [
                'conn' => $from,
                'ships' => [],
                'shots' => [],
                'roomId' => $roomId,
            ];

            echo "#{$roomId}-es szoba (" . count($this->rooms[$roomId]['players']) . "/2)\n";
            echo "Játékosok: " . json_encode($this->rooms[$roomId]['players']) . "\n";

            $this->sendToPlayer($uid, [
                "type" => "waiting",
                "message" => "Várakozás második játékosra...",
            ]);

            if (count($this->rooms[$roomId]['players']) == 2) {
                $this->startGame($roomId);
            }
        }

        switch ($data['type']) {
            case 'placeShip':
                $uid = $data['uid'];
                $this->handlePlaceShip($uid, $data['ships']);
                break;
            case 'shoot':
                $uid = $data['uid'];
                $this->handleShoot($uid, $data['x'], $data['y']);
                break;
        }
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);

        foreach ($this->players as $uid => $player) {
            if ($player['conn'] == $conn) {
                $roomId = $player['roomId'];
                unset($this->players[$uid]);
                echo "Játékos kilépett: UID = {$uid}\n"; 

                if (isset($this->rooms[$roomId])) {
                    $this->rooms[$roomId]['players'] = array_filter($this->rooms[$roomId]['players'], function($playerUid) use ($uid) {
                        return $playerUid != $uid;
                    });

                    echo "#{$roomId}-es szoba (" . count($this->rooms[$roomId]['players']) . "/2)\n";

                    if (count($this->rooms[$roomId]['players']) == 0) {
                        unset($this->rooms[$roomId]);
                        echo "#{$roomId}-es szoba törölve.\n";
                    } else {
                        $gameId = $this->findGameByPlayer($uid);
                        if ($gameId && isset($this->games[$gameId])) {
                            $game = $this->games[$gameId];
                            if (!isset($game['ended'])) {
                                $opponentUid = $this->rooms[$roomId]['players'][0] ?? null;
                                if ($opponentUid) {
                                    $this->sendToPlayer($opponentUid, [
                                        "type" => "gameOver",
                                        "message" => "A másik játékos elhagyta a mérkőzést. A játék véget ért.",
                                    ]);
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    public function onError(ConnectionInterface $conn, Exception $e) {
        echo "Hiba: {$e->getMessage()}\n";
        $conn->close();
    }

    private function createRoom() {
        $roomId = count($this->rooms) + 1;
        $this->rooms[$roomId] = [
            'players' => [],
        ];
        echo "#{$roomId}-es szoba létrehozva.\n";
        return $roomId;
    }

    private function findAvailableRoom() {
        foreach ($this->rooms as $roomId => $room) {
            if (count($room['players']) < 2) {
                return $roomId;
            }
        }
        return null;
    }

    private function findRoomByPlayer($uid) {
        foreach ($this->rooms as $roomId => $room) {
            if (in_array($uid, $room['players'])) {
                return $roomId;
            }
        }
        return null;
    }

    private function startGame($roomId) {
        $playerUids = $this->rooms[$roomId]['players'];
        $gameId = uniqid();

        $this->games[$gameId] = [
            'players' => $playerUids,
            'currentTurn' => $playerUids[0],
            'roomId' => $roomId,
            'ended' => false,
        ];

        foreach ($playerUids as $uid) {
            $this->sendToPlayer($uid, [
                "type" => "start",
                "message" => "A játék elindult! Helyezd el a hajóidat.",
                "yourTurn" => ($uid == $this->games[$gameId]['currentTurn']),
            ]);
        }
    }

    private function handlePlaceShip($uid, $ships) {
        if (!isset($this->players[$uid])) {
            $this->sendToPlayer($uid, [
                "type" => "error",
                "message" => "Hiba: A játékos nem található!",
            ]);
            return;
        }

        $this->players[$uid]['ships'] = $ships;

        $allShipsPlaced = true;
        foreach ($this->players as $player) {
            if (count($player['ships']) != 10) {
                $allShipsPlaced = false;
                break;
            }
        }

        if ($allShipsPlaced) {
            foreach ($this->players as $playerUid => $player) {
                $this->sendToPlayer($playerUid, [
                    "type" => "shipsPlaced",
                    "message" => "Mindkét játékos elhelyezte a hajóit. A játék kezdődik!",
                ]);
            }
            $this->startShootingPhase();
        }
    }

    private function startShootingPhase() {
        $playerUids = array_keys($this->players);
        $gameId = array_key_last($this->games);

        foreach ($this->players as $uid => $player) {
            $this->sendToPlayer($uid, [
                "type" => "turn",
                "yourTurn" => ($uid == $this->games[$gameId]['currentTurn']),
            ]);
        }
    }

    private function handleShoot($uid, $x, $y) {
        if (!isset($this->players[$uid])) {
            $this->sendToPlayer($uid, [
                "type" => "error",
                "message" => "Hiba: A játékos nem található!",
            ]);
            return;
        }

        $gameId = $this->findGameByPlayer($uid);
        if (!$gameId || !isset($this->games[$gameId])) {
            $this->sendToPlayer($uid, [
                "type" => "error",
                "message" => "Hiba: A játék nem található!",
            ]);
            return;
        }

        $game = $this->games[$gameId];

        if ($uid != $game['currentTurn']) {
            $this->sendToPlayer($uid, [
                "type" => "error",
                "message" => "Nem te következel!",
            ]);
            return;
        }

        $opponentUid = ($uid == $game['players'][0]) ? $game['players'][1] : $game['players'][0];

        if (!isset($this->players[$opponentUid])) {
            $this->sendToPlayer($uid, [
                "type" => "error",
                "message" => "Hiba: Az ellenfél nem található!",
            ]);
            return;
        }

        $opponentShips = $this->players[$opponentUid]['ships'];
        $hit = false;

        foreach ($opponentShips as $ship) {
            if ($ship['x'] == $x && $ship['y'] == $y) {
                $hit = true;
                break;
            }
        }

        $this->players[$uid]['shots'][] = ['x' => $x, 'y' => $y, 'hit' => $hit];

        $this->sendToPlayer($uid, [
            "type" => "shotResult",
            "x" => $x,
            "y" => $y,
            "hit" => $hit,
        ]);

        $this->checkWin($opponentUid);

        $game['currentTurn'] = $opponentUid;
        $this->games[$gameId] = $game;

        foreach ($this->players as $id => $player) {
            $this->sendToPlayer($id, [
                "type" => "turn",
                "yourTurn" => ($id == $game['currentTurn']),
            ]);
        }
    }

    private function checkWin($opponentUid) {
        if (!isset($this->players[$opponentUid]['ships'])) {
            return;
        }

        $opponentShips = $this->players[$opponentUid]['ships'];
        $currentTurnUid = $this->games[array_key_last($this->games)]['currentTurn'];

        if (!isset($this->players[$currentTurnUid]['shots'])) {
            return;
        }

        $playerShots = $this->players[$currentTurnUid]['shots'];

        if (!is_array($opponentShips) || !is_array($playerShots)) {
            return;
        }

        $remainingShips = array_filter($opponentShips, function($ship) use ($playerShots) {
            foreach ($playerShots as $shot) {
                if (isset($shot['x'], $shot['y'], $shot['hit']) && 
                    $shot['x'] == $ship['x'] && $shot['y'] == $ship['y'] && $shot['hit']) {
                    return false;
                }
            }
            return true;
        });

        if (count($remainingShips) == 0) {
            $winnerUid = $this->games[array_key_last($this->games)]['currentTurn'];
            $this->endGame($winnerUid);
        }
    }

    private function endGame($winnerUid) {
        $gameId = array_key_last($this->games);
        if (!$gameId || !isset($this->games[$gameId])) {
            return;
        }

        $this->games[$gameId]['ended'] = true;

        foreach ($this->players as $uid => $player) {
            $this->sendToPlayer($uid, [
                "type" => "end",
                "message" => ($uid == $winnerUid) ? "Nyertél!" : "Vesztettél!",
            ]);
        }

        $this->saveMatchResult($winnerUid);
    }

    private function saveMatchResult($winnerUid) {
        $gameId = array_key_last($this->games);
        if (!$gameId || !isset($this->games[$gameId])) {
            return;
        }

        $game = $this->games[$gameId];
        $player1Uid = $game['players'][0];
        $player2Uid = $game['players'][1];

        $player1Hits = count(array_filter($this->players[$player1Uid]['shots'], function($shot) {
            return $shot['hit'];
        }));
        $player2Hits = count(array_filter($this->players[$player2Uid]['shots'], function($shot) {
            return $shot['hit'];
        }));

        $duration = 10; 

        try {
            $player1Id = $this->getUserIdByUid($player1Uid);
            $player2Id = $this->getUserIdByUid($player2Uid);
            $winnerId = $this->getUserIdByUid($winnerUid);

            if ($player1Id && $player2Id && $winnerId) {
                $sql = "INSERT INTO matches (match_date, player1_id, player2_id, winner_id, player1_hits, player2_hits, duration)
                        VALUES (NOW(), ?, ?, ?, ?, ?, ?)";
                $stmt = $this->conn->prepare($sql);
                $stmt->bind_param("iiiiii", $player1Id, $player2Id, $winnerId, $player1Hits, $player2Hits, $duration);
                $stmt->execute();
                $stmt->close();
            }
        } catch (Exception $e) {
            echo "Hiba a mérkőzés eredményének mentésekor: " . $e->getMessage();
        }
    }

    private function getUserIdByUid($uid) {
        try {
            $sql = "SELECT id FROM users WHERE firebase_uid = ?";
            $stmt = $this->conn->prepare($sql);
            $stmt->bind_param("s", $uid);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();
            $stmt->close();

            return $row ? $row['id'] : null;
        } catch (Exception $e) {
            echo "Hiba a felhasználó ID lekérésekor: " . $e->getMessage();
            return null;
        }
    }

    private function findGameByPlayer($uid) {
        foreach ($this->games as $gameId => $game) {
            if (in_array($uid, $game['players'])) {
                return $gameId;
            }
        }
        return null;
    }

    private function sendToPlayer($uid, $message) {
        if (isset($this->players[$uid]['conn']) && $this->players[$uid]['conn'] instanceof ConnectionInterface) {
            $this->players[$uid]['conn']->send(json_encode($message));
        } else {
            echo "Hiba: A játékos kapcsolata nem érvényes (UID: {$uid}).\n";
        }
    }
}