<?php 

namespace Sim\Websocket;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Exception;
use PDO;

class BiddingService implements MessageComponentInterface {
    protected $clients;
    protected $players = [];
    protected $pdo;
    protected $matchId;

    public function __construct() {
        $this->clients = new \SplObjectStorage;

        try {
            $this->pdo = new PDO('mysql:host=localhost;dbname=torpedo;charset=utf8', 'root', '');
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (Exception $e) {
            echo "Database connection failed: " . $e->getMessage();
            exit;
        }
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "New connection established.\n";
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);

        switch ($data['type']) {
            case 'login':
                $this->handleLogin($from, $data['user_id']);
                break;
            case 'placeShip':
                $this->handlePlaceShip($from, $data['ships']);
                break;
            case 'shoot':
                $this->handleShoot($from, $data['x'], $data['y']);
                break;
        }
    }

    private function handleLogin($from, $userId) {
        // Ellenőrizzük, hogy a felhasználó létezik-e a rendszerben
        $stmt = $this->pdo->prepare("SELECT id, username FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            $from->send(json_encode(["type" => "error", "message" => "Invalid user ID"]));
            return;
        }

        // Hozzáadjuk a felhasználót a bejelentkezett játékosok listájához
        $this->players[$userId] = [
            'conn' => $from,
            'username' => $user['username'],
            'ships' => [],
            'opponent' => null
        ];

        echo "User {$user['username']} (ID: {$userId}) logged in.\n";

        // Kezdjünk új játékot, ha két játékos bejelentkezett
        if (count($this->players) == 2) {
            $playerIds = array_keys($this->players);

            // Új mérkőzés indítása, amikor két játékos bejelentkezett
            $stmt = $this->pdo->prepare("INSERT INTO matches (player1_id, player2_id, created_at) VALUES (?, ?, NOW())");
            $stmt->execute([$playerIds[0], $playerIds[1]]);
            $this->matchId = $this->pdo->lastInsertId();

            // Kijelöljük az ellenfeleket a játékosok számára
            $this->players[$playerIds[0]]['opponent'] = $playerIds[1];
            $this->players[$playerIds[1]]['opponent'] = $playerIds[0];

            echo "Game started between {$this->players[$playerIds[0]]['username']} and {$this->players[$playerIds[1]]['username']} (Match ID: {$this->matchId})\n";

            // Üzenet küldése mindkét játékosnak a meccs indításáról
            foreach ($this->players as $id => $player) {
                $player['conn']->send(json_encode([
                    "type" => "gameStart", 
                    "match_id" => $this->matchId,
                    "username" => $player['username'],
                    "user_id" => $id
                ]));
            }
        } else {
            // Ha nem két játékos van még bejelentkezve, várakozás üzenet küldése
            $from->send(json_encode([
                "type" => "waitingForOpponent", 
                "message" => "Waiting for an opponent to join..."
            ]));
        }

        // Üzenet küldése a bejelentkezett felhasználónak, hogy sikeres volt a login
        $from->send(json_encode([
            "type" => "loginSuccess", 
            "user_id" => $userId, 
            "match_id" => $this->matchId,
            "username" => $user['username']
        ]));
    }

    private function handlePlaceShip($from, $ships) {
        $userId = $this->getUserIdByConnection($from);
        if (!$userId) {
            $from->send(json_encode(["type" => "error", "message" => "You are not logged in"]));
            return;
        }

        $this->players[$userId]['ships'] = $ships;

        $stmt = $this->pdo->prepare("INSERT INTO ships (user_id, match_id, ship_type_id, start_x, start_y, orientation) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($ships as $ship) {
            $stmt->execute([$userId, $this->matchId, 1, $ship['x'], $ship['y'], 'horizontal']);
        }

        $from->send(json_encode([
            "type" => "shipsPlaced", 
            "match_id" => $this->matchId, 
            "username" => $this->players[$userId]['username'],
            "user_id" => $userId
        ]));
    }

    private function handleShoot($from, $x, $y) {
        $userId = $this->getUserIdByConnection($from);
        if (!$userId || !isset($this->players[$userId]['opponent'])) {
            $from->send(json_encode(["type" => "error", "message" => "No opponent found"]));
            return;
        }

        $opponentId = $this->players[$userId]['opponent'];
        if (!isset($this->players[$opponentId])) {
            $from->send(json_encode(["type" => "error", "message" => "Opponent not connected"]));
            return;
        }

        $hit = false;
        foreach ($this->players[$opponentId]['ships'] as $ship) {
            if ($ship['x'] === $x && $ship['y'] === $y) {
                $hit = true;
                break;
            }
        }

        $stmt = $this->pdo->prepare("INSERT INTO shots (match_id, user_id, target_user_id, x, y, is_hit) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$this->matchId, $userId, $opponentId, $x, $y, $hit ? 1 : 0]);

        $from->send(json_encode([
            "type" => "shotResult", 
            "x" => $x, 
            "y" => $y, 
            "hit" => $hit, 
            "match_id" => $this->matchId,
            "username" => $this->players[$userId]['username'],
            "user_id" => $userId
        ]));
        $this->players[$opponentId]['conn']->send(json_encode([
            "type" => "opponentShot", 
            "x" => $x, 
            "y" => $y, 
            "hit" => $hit, 
            "match_id" => $this->matchId,
            "username" => $this->players[$opponentId]['username'],
            "user_id" => $opponentId
        ]));
    }

    public function onClose(ConnectionInterface $conn) {
        $userId = $this->getUserIdByConnection($conn);
        if ($userId) {
            unset($this->players[$userId]);
        }

        $this->clients->detach($conn);
        echo "Connection closed for user ID: {$userId}\n";
    }

    public function onError(ConnectionInterface $conn, Exception $e) {
        echo "Error: {$e->getMessage()}\n";
        $conn->close();
    }

    private function getUserIdByConnection($conn) {
        foreach ($this->players as $userId => $player) {
            if ($player['conn'] === $conn) {
                return $userId;
            }
        }
        return null;
    }
}
