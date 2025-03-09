<?php

namespace Sim\Websocket;

use Exception;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
require dirname(__DIR__).'/vendor/autoload.php';

class BiddingService implements MessageComponentInterface
{
    protected $clients;

    public function __construct()
    {
        echo "Starting BiddingService... \n";
        $this->clients = new \SplObjectStorage;
    }

    public function onOpen(ConnectionInterface $conn)
    {
        echo "New connection opened {$conn-> resourceId}\n";
        $this->clients-> attach($conn);
    }

    public function onMessage(ConnectionInterface $from, $msg)
    {
        
    }

    public function onClose(ConnectionInterface $conn)
    {
        
    }

    public function onError(ConnectionInterface $conn, Exception $e)
    {
        
    }
}
?>