<?php
namespace Sim\Websocket;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Exception;

class BiddingService implements MessageComponentInterface {
    protected $clients;
    protected $games = [];
    protected $players = [];

    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->games = [];
        $this->players = [];
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "Új kapcsolat: {$conn->resourceId}\n";

        if (count($this->players) < 2) {
            $this->players[$conn->resourceId] = [
                'conn' => $conn,
                'ships' => [],
                'shots' => [],
            ];
            $conn->send(json_encode([
                "type" => "waiting",
                "message" => "Várakozás második játékosra...",
            ]));

            if (count($this->players) === 2) {
                $this->startGame();
            }
        } else {
            $conn->send(json_encode([
                "type" => "error",
                "message" => "A játék már tele van.",
            ]));
            $conn->close();
        }
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);

        switch ($data['type']) {
            case 'placeShip':
                $this->handlePlaceShip($from, $data['ships']);
                break;
            case 'shoot':
                $this->handleShoot($from, $data['x'], $data['y']);
                break;
        }
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        unset($this->players[$conn->resourceId]);
        echo "Kapcsolat bezárva: {$conn->resourceId}\n";
    }

    public function onError(ConnectionInterface $conn, Exception $e) {
        echo "Hiba: {$e->getMessage()}\n";
        $conn->close();
    }

    private function startGame() {
        $playerIds = array_keys($this->players);
        $gameId = uniqid();

        $this->games[$gameId] = [
            'players' => $playerIds,
            'currentTurn' => $playerIds[0],
        ];

        foreach ($this->players as $playerId => $player) {
            $player['conn']->send(json_encode([
                "type" => "start",
                "message" => "A játék elindult! Helyezd el a hajóidat.",
                "yourTurn" => ($playerId === $this->games[$gameId]['currentTurn']),
            ]));
        }
    }

    private function handlePlaceShip($from, $ships) {
        $playerId = $from->resourceId;

        if (!isset($this->players[$playerId])) {
            $from->send(json_encode([
                "type" => "error",
                "message" => "Hiba: A játékos nem található!",
            ]));
            return;
        }

        $this->players[$playerId]['ships'] = $ships;

        $allShipsPlaced = true;
        foreach ($this->players as $player) {
            if (count($player['ships']) !== 10) {
                $allShipsPlaced = false;
                break;
            }
        }

        if ($allShipsPlaced) {
            foreach ($this->players as $player) {
                $player['conn']->send(json_encode([
                    "type" => "shipsPlaced",
                    "message" => "Mindkét játékos elhelyezte a hajóit. A játék kezdődik!",
                ]));
            }
            $this->startShootingPhase();
        }
    }

    private function startShootingPhase() {
        $playerIds = array_keys($this->players);
        $gameId = array_key_last($this->games);

        foreach ($this->players as $playerId => $player) {
            $player['conn']->send(json_encode([
                "type" => "turn",
                "yourTurn" => ($playerId === $this->games[$gameId]['currentTurn']),
            ]));
        }
    }

    private function handleShoot($from, $x, $y) {
        $playerId = $from->resourceId;

        if (!isset($this->players[$playerId])) {
            $from->send(json_encode([
                "type" => "error",
                "message" => "Hiba: A játékos nem található!",
            ]));
            return;
        }

        $gameId = $this->findGameByPlayer($playerId);
        if (!$gameId || !isset($this->games[$gameId])) {
            $from->send(json_encode([
                "type" => "error",
                "message" => "Hiba: A játék nem található!",
            ]));
            return;
        }

        $game = $this->games[$gameId];

        if ($playerId !== $game['currentTurn']) {
            $from->send(json_encode([
                "type" => "error",
                "message" => "Nem te következel!",
            ]));
            return;
        }

        $opponentId = ($playerId === $game['players'][0]) ? $game['players'][1] : $game['players'][0];

        if (!isset($this->players[$opponentId])) {
            $from->send(json_encode([
                "type" => "error",
                "message" => "Hiba: Az ellenfél nem található!",
            ]));
            return;
        }

        $opponentShips = $this->players[$opponentId]['ships'];
        $hit = false;

        foreach ($opponentShips as $ship) {
            if ($ship['x'] === $x && $ship['y'] === $y) {
                $hit = true;
                break;
            }
        }

        $this->players[$playerId]['shots'][] = ['x' => $x, 'y' => $y, 'hit' => $hit];

        $from->send(json_encode([
            "type" => "shotResult",
            "x" => $x,
            "y" => $y,
            "hit" => $hit,
        ]));

        $this->checkWin($opponentId);

        $game['currentTurn'] = $opponentId;
        $this->games[$gameId] = $game;

        foreach ($this->players as $id => $player) {
            $player['conn']->send(json_encode([
                "type" => "turn",
                "yourTurn" => ($id === $game['currentTurn']),
            ]));
        }
    }

    private function checkWin($opponentId) {
        $opponentShips = $this->players[$opponentId]['ships'];
        $playerShots = $this->players[$this->games[array_key_last($this->games)]['currentTurn']]['shots'];

        $remainingShips = array_filter($opponentShips, function($ship) use ($playerShots) {
            foreach ($playerShots as $shot) {
                if ($shot['x'] === $ship['x'] && $shot['y'] === $ship['y'] && $shot['hit']) {
                    return false;
                }
            }
            return true;
        });

        if (count($remainingShips) === 0) {
            $winnerId = $this->games[array_key_last($this->games)]['currentTurn'];
            $this->endGame($winnerId);
        }
    }

    private function endGame($winnerId) {
        foreach ($this->players as $playerId => $player) {
            $player['conn']->send(json_encode([
                "type" => "end",
                "message" => ($playerId === $winnerId) ? "Nyertél!" : "Vesztettél!",
            ]));
        }
    }

    private function findGameByPlayer($playerId) {
        foreach ($this->games as $gameId => $game) {
            if (in_array($playerId, $game['players'])) {
                return $gameId;
            }
        }
        return null;
    }
}