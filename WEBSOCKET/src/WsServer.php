<?php

use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use Sim\Websocket\BiddingService;

require dirname(__DIR__) . '/vendor/autoload.php';

$port = 5500;

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new BiddingService()
        )
    ),
    $port
);

echo "WebSocket szerver elindult a {$port} porton...\n";
$server->run();