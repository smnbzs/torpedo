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

    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->games = [];
        $this->players = [];

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

            if (count($this->players) < 2 && !isset($this->players[$uid])) {
                $this->players[$uid] = [
                    'conn' => $from,
                    'ships' => [],
                    'shots' => [],
                ];

                echo "Új játékos csatlakozott: UID = {$uid}\n";

                $this->sendToPlayer($uid, [
                    "type" => "waiting",
                    "message" => "Várakozás második játékosra...",
                ]);

                if (count($this->players) == 2) {
                    $this->startGame();
                }
            } else {
                $this->sendToPlayer($uid, [
                    "type" => "error",
                    "message" => "A játék már tele van, vagy az UID már használatban van.",
                ]);
                $from->close();
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
                unset($this->players[$uid]);
                echo "Játékos kilépett: UID = {$uid}\n"; 

                $gameId = $this->findGameByPlayer($uid);
                if ($gameId && isset($this->games[$gameId])) {
                    $opponentUid = ($uid == $this->games[$gameId]['players'][0]) 
                        ? $this->games[$gameId]['players'][1] 
                        : $this->games[$gameId]['players'][0];

                    $this->sendToPlayer($opponentUid, [
                        "type" => "gameOver",
                        "message" => "A másik játékos elhagyta a mérkőzést. A játék véget ért.",
                    ]);

                    unset($this->games[$gameId]);
                }
                break;
            }
        }
    }

    public function onError(ConnectionInterface $conn, Exception $e) {
        echo "Hiba: {$e->getMessage()}\n";
        $conn->close();
    }

    private function startGame() {
        $playerUids = array_keys($this->players);
        $gameId = uniqid();

        $this->games[$gameId] = [
            'players' => $playerUids,
            'currentTurn' => $playerUids[0],
        ];

        foreach ($this->players as $uid => $player) {
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
            foreach ($this->players as $player) {
                $this->sendToPlayer($player['uid'], [
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
        $opponentShips = $this->players[$opponentUid]['ships'];
        $playerShots = $this->players[$this->games[array_key_last($this->games)]['currentTurn']]['shots'];

        $remainingShips = array_filter($opponentShips, function($ship) use ($playerShots) {
            foreach ($playerShots as $shot) {
                if ($shot['x'] == $ship['x'] && $shot['y'] == $ship['y'] && $shot['hit']) {
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