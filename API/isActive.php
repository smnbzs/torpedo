<?php
require_once '../DATABASE/database.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php:
    $data = json_decode($rawdata, true);
    if (!isset($data["email"])) {
        echo json_encode(["error" => "Hiányzó adatok"]);
        exit;
    }
    $email = $data["email"];
    $sql = "SELECT is_active FROM users WHERE email = ?";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "s", $email);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    if ($row = mysqli_fetch_assoc($result)) {
        echo json_encode(["isActive" => (int)$row["is_active"]]); 
    } else {
        echo json_encode(["error" => "User not found"]);
    }
    mysqli_stmt_close($stmt);
    mysqli_close($conn);
    exit;
}
echo json_encode(["error" => "Invalid request method"]);
?>