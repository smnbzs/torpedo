<?php

header('Content-Type: application/json');

// Beállítások
$chatFile = 'chat.json';

// Ellenőrizzük, hogy a kérés POST típusú-e
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // A bejövő adatokat JSON formátumban olvassuk
    $inputData = json_decode(file_get_contents('php://input'), true);
    
    if (isset($inputData['message'])) {
        $message = $inputData['message'];

        // Ellenőrizzük, hogy nem üres üzenetet küldtek-e
        if (!empty($message)) {
            // Beolvassuk a meglévő chat üzeneteket a fájlból
            $chatMessages = [];
            if (file_exists($chatFile)) {
                $chatMessages = json_decode(file_get_contents($chatFile), true);
            }

            // Új üzenet hozzáadása
            $chatMessages[] = [
                'message' => $message,
                'timestamp' => time()
            ];

            // Az új üzenetek mentése a fájlba
            file_put_contents($chatFile, json_encode($chatMessages));

            // Visszaküldjük a sikeres válaszot
            echo json_encode(['status' => 'success']);
        } else {
            // Üzenet üres, hibát küldünk
            echo json_encode(['status' => 'error', 'message' => 'Üzenet nem lehet üres']);
        }
    } else {
        // Hibás formátum
        echo json_encode(['status' => 'error', 'message' => 'Nincs üzenet']);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Ha GET kérést küldtek, visszaküldjük a chat üzeneteket
    if (file_exists($chatFile)) {
        echo file_get_contents($chatFile);
    } else {
        echo json_encode([]);
    }
} else {
    // Hibás kérés
    echo json_encode(['status' => 'error', 'message' => 'Érvénytelen kérés']);
}
