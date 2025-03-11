<?php
require_once '../DATABASE/database.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input") ?? null;
    $data = json_decode($rawdata, true);
    
    if (!isset($data["email"]) || !isset($data["password"])) {
        echo json_encode(["error" => "Hiányzó adatok"]);
        exit;
    }
    
    $email = $data["email"];
    $password = $data["password"];
    
    $sql = "SELECT id, username, password_hash FROM users WHERE email = ?";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "s", $email);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    
    if ($row = mysqli_fetch_assoc($result)) {
        if (password_verify($password, $row["password_hash"])) {
            echo json_encode([
                "message" => "Sikeres bejelentkezés",
                "user" => [
                    "id" => $row["id"],
                    "username" => $row["username"],
                    "email" => $email
                ]
            ]);
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
