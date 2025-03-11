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
        echo "New connection: {$conn->resourceId}\n";
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
        // Ellenőrizzük, hogy a user_id létezik-e az adatbázisban
        $stmt = $this->pdo->prepare("SELECT id FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            $from->send(json_encode(["type" => "error", "message" => "Invalid user ID"]));
            return;
        }

        // Hozzáadjuk a játékosok listájához
        $this->players[$userId] = [
            'conn' => $from,
            'ships' => [],
            'opponent' => null
        ];

        echo "User {$userId} logged in.\n";

        $from->send(json_encode(["type" => "loginSuccess", "user_id" => $userId]));

        // Játék párosítás
        if (count($this->players) == 2) {
            $playerIds = array_keys($this->players);
            $this->players[$playerIds[0]]['opponent'] = $playerIds[1];
            $this->players[$playerIds[1]]['opponent'] = $playerIds[0];

            echo "Game started between {$playerIds[0]} and {$playerIds[1]}\n";

            foreach ($this->players as $id => $player) {
                $player['conn']->send(json_encode(["type" => "gameStart"]));
            }
        }
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
            $stmt->execute([$userId, 1, 1, $ship['x'], $ship['y'], 'horizontal']);
        }

        $from->send(json_encode(["type" => "shipsPlaced"]));
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
        $stmt->execute([1, $userId, $opponentId, $x, $y, $hit ? 1 : 0]);

        $from->send(json_encode(["type" => "shotResult", "x" => $x, "y" => $y, "hit" => $hit]));
        $this->players[$opponentId]['conn']->send(json_encode(["type" => "opponentShot", "x" => $x, "y" => $y, "hit" => $hit]));
    }

    public function onClose(ConnectionInterface $conn) {
        $userId = $this->getUserIdByConnection($conn);
        if ($userId) {
            unset($this->players[$userId]);
        }

        $this->clients->detach($conn);
        echo "Connection closed: {$conn->resourceId}\n";
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
