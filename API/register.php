<?php
require_once '../DATABASE/database.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input");
    $data = json_decode($rawdata, true);
    
    $username = $data["username"];
    $email = $data["email"];
    $password = $data["password"];
    $uid = $data["uid"];  
    
    $password_hash = password_hash($password, PASSWORD_BCRYPT);

  
    $sql = "INSERT INTO `users`(`username`, `email`, `password_hash`, `firebase_uid`) VALUES (?, ?, ?, ?)";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "ssss", $username, $email, $password_hash, $uid);
    if (mysqli_stmt_execute($stmt)) {
        echo json_encode("Sikeres rögzítés");
    } else {
        echo json_encode("Hiba történt a rögzítés során");
    }
}
?>
