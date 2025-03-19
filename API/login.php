<?php
require_once '../DATABASE/database.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input") ?? null;
    $data = json_decode($rawdata, true);
    
    if (!isset($data["email"]) || !isset($data["password"]) || !isset($data["firebaseUID"])) {
        echo json_encode(["error" => "Hiányzó adatok"]);
        exit;
    }
    
    $email = $data["email"];
    $password = $data["password"];
    $firebaseUID = $data["firebaseUID"];

    $sql = "SELECT id, username, password_hash, firebase_uid FROM users WHERE email = ?";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "s", $email);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);

    if ($row = mysqli_fetch_assoc($result)) {
        if (password_verify($password, $row["password_hash"])) {
            if ($row["firebase_uid"] == $firebaseUID) {
               
                $update_sql = "UPDATE users SET is_active = 1 WHERE email = ?";
                $update_stmt = mysqli_prepare($conn, $update_sql);
                mysqli_stmt_bind_param($update_stmt, "s", $email);
                mysqli_stmt_execute($update_stmt);
                mysqli_stmt_close($update_stmt);

                echo json_encode([
                    "message" => "Sikeres bejelentkezés",
                    "user" => [
                        "id" => $row["id"],
                        "username" => $row["username"],
                        "email" => $email
                    ]
                ]);
            } else {
                echo json_encode(["error" => "Firebase UID nem egyezik"]);
            }
        } else {
            echo json_encode(["error" => "Hibás jelszó"]);
        }
    } else {
        echo json_encode(["error" => "Nem létező felhasználó"]);
    }
    
    mysqli_stmt_close($stmt);
    mysqli_close($conn);
}
?> 