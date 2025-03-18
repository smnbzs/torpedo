<?php
require_once '../DATABASE/database.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json"); 

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $rawdata = file_get_contents("php://input");
    $data = json_decode($rawdata, true);

    
    if (isset($data["userUID"])) {
        $uid = $data["userUID"];

      
        $sql = "SELECT username FROM users WHERE firebase_uid = ?";
        $stmt = mysqli_prepare($conn, $sql);

        if ($stmt) {
            mysqli_stmt_bind_param($stmt, "s", $uid);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);

           
            if ($row = mysqli_fetch_assoc($result)) {
                
                echo json_encode([
                    "status" => "success",
                    "username" => $row["username"]
                ]);
            } else {
                
                echo json_encode([
                    "status" => "error",
                    "message" => "No user found with the provided UID."
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
            "message" => "Missing userUID in the request."
        ]);
    }

    mysqli_close($conn);
} else {
    
    echo json_encode([
        "status" => "error",
        "message" => "Invalid request method. Only POST is allowed."
    ]);
}
?> 