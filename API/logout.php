<?php
require_once '../DATABASE/database.php';
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input") ?? null;
    $data = json_decode($rawdata, true);

    if (!isset($data["userUID"])) {
        echo json_encode(["status" => "error", "message" => "User UID is required"]);
        exit;
    }

    $userUID = $data["userUID"];

    error_log("Received userUID: " . $userUID);

    $sql = "UPDATE users SET is_active = 0 WHERE firebase_uid = ?";
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, "s", $userUID);

    if (mysqli_stmt_execute($stmt)) {
        echo json_encode(["status" => "success", "message" => "User logged out"]);
    } else {
        echo json_encode(["status" => "error", "message" => "User not found or no change"]);
    }

    mysqli_stmt_close($stmt);
} else {
    echo json_encode(["status" => "error", "message" => "Invalid request method"]);
}

mysqli_close($conn);
?>