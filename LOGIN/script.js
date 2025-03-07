function userlogin()
{
    var email = document.getElementById("email");
    var password = document.getElementById("password");
    fetch("http:localhost/torpedo/api/login",
        {
            method: "POST", 
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({"email": email, "password": password})
        }
    )
}