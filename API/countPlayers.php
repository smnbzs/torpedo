<?php
require_once '../DATABASE/database.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] == "GET") {
    $isActive = 1;
        $sql = "SELECT COUNT(*) as `active_users` FROM users WHERE is_active = ?";
        $stmt = mysqli_prepare($conn, $sql);

        if ($stmt) {
            mysqli_stmt_bind_param($stmt, "i", $isActive);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);

            if ($row = mysqli_fetch_assoc($result)) {
                echo json_encode([
                    "status" => "success",
                    "active_users_count" => $row["active_users"]
                ]);
            } else {
                echo json_encode([
                    "status" => "error",
                    "message" => "Failed to retrieve the active user count."
                ]);
            }

            mysqli_free_result($result);
            mysqli_stmt_close($stmt);
        } else {
            echo json_encode([
                "status" => "error",
                "message" => "Failed to prepare the SQL statement."
            ]);
        }
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "Missing 'is_active' parameter in the request."
        ]);
    }

    mysqli_close($conn);

?>
