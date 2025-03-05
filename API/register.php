<?php
require_once '../DATABASE/database.php';

if($_SERVER["REQUEST_METHOD"] == "POST")
{
    $rawdata = file_get_contents("php://input") ??null;
    $data = json_decode($rawdata, true);

    $username = $data["username"];
    $email = $data["email"];
    $password = $data["password"];
    $password_hash = password_hash($password, PASSWORD_BCRYPT);

    $sql = "INSERT INTO `users`(`username`, `email`, `password_hash`) VALUES (?, ?, ?)";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "sss", $username, $email, $password_hash);
    mysqli_stmt_execute($stmt);
    echo json_encode("Sikeres rögzítés");
}

?>
