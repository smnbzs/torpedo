<?php
require_once '../DATABASE/database.php';

// CORS fejlécek beállítása
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json"); // JSON válasz formátum

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input");
    $data = json_decode($rawdata, true);

    // Ellenőrizzük, hogy a userUID létezik-e a kapott adatokban
    if (isset($data["userUID"])) {
        $uid = $data["userUID"];

        // SQL lekérdezés előkészítése
        $sql = "SELECT username FROM users WHERE firebase_uid = ?";
        $stmt = mysqli_prepare($conn, $sql);

        if ($stmt) {
            mysqli_stmt_bind_param($stmt, "s", $uid);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);

            // Ellenőrizzük, hogy van-e eredmény
            if ($row = mysqli_fetch_assoc($result)) {
                // Sikeres válasz
                echo json_encode([
                    "status" => "success",
                    "username" => $row["username"]
                ]);
            } else {
                // Nincs találat
                echo json_encode([
                    "status" => "error",
                    "message" => "No user found with the provided UID."
                ]);
            }

            // Eredményhalmaz és statement lezárása
            mysqli_free_result($result);
            mysqli_stmt_close($stmt);
        } else {
            // Hiba az SQL előkészítésekor
            echo json_encode([
                "status" => "error",
                "message" => "Failed to prepare the SQL statement."
            ]);
        }
    } else {
        // Hiányzó userUID
        echo json_encode([
            "status" => "error",
            "message" => "Missing userUID in the request."
        ]);
    }

    // Adatbázis kapcsolat lezárása
    mysqli_close($conn);
} else {
    // Érvénytelen kérés metódus
    echo json_encode([
        "status" => "error",
        "message" => "Invalid request method. Only POST is allowed."
    ]);
}
?>