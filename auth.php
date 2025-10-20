<?php
header('Content-Type: application/json; charset=UTF-8');
session_start();

$db_path = '/data/ads.db';

try {
    $db = new SQLite3($db_path);
    $db->busyTimeout(5000);

    // Получение данных из запроса
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? $_POST['action'] ?? '';

    if ($action === 'check_user_exists') {
        $result = $db->querySingle("SELECT COUNT(*) FROM users");
        echo json_encode(['exists' => $result > 0]);
    } elseif ($action === 'register') {
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';

        if (empty($username) || empty($password)) {
            echo json_encode(['success' => false, 'error' => 'Логин и пароль не могут быть пустыми']);
            exit;
        }

        // Хеширование пароля
        $hashed_password = password_hash($password, PASSWORD_BCRYPT);

        // Проверка, существует ли пользователь
        $stmt = $db->prepare("SELECT id FROM users WHERE username = :username");
        $stmt->bindValue(':username', $username, SQLITE3_TEXT);
        $result = $stmt->execute()->fetchArray(SQLITE3_ASSOC);

        if ($result) {
            echo json_encode(['success' => false, 'error' => 'Пользователь с таким логином уже существует']);
            exit;
        }

        // Регистрация пользователя
        $stmt = $db->prepare("INSERT INTO users (username, password) VALUES (:username, :password)");
        $stmt->bindValue(':username', $username, SQLITE3_TEXT);
        $stmt->bindValue(':password', $hashed_password, SQLITE3_TEXT);
        $stmt->execute();

        // Генерация токена
        $token = bin2hex(random_bytes(16));
        $_SESSION['user'] = $username;
        $_SESSION['token'] = $token;

        echo json_encode(['success' => true, 'token' => $token]);
    } elseif ($action === 'login') {
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';

        $stmt = $db->prepare("SELECT password FROM users WHERE username = :username");
        $stmt->bindValue(':username', $username, SQLITE3_TEXT);
        $result = $stmt->execute()->fetchArray(SQLITE3_ASSOC);

        if ($result && password_verify($password, $result['password'])) {
            $token = bin2hex(random_bytes(16));
            $_SESSION['user'] = $username;
            $_SESSION['token'] = $token;
            echo json_encode(['success' => true, 'token' => $token]);
        } else {
            echo json_encode(['success' => false]);
        }
    } elseif ($action === 'verify_token') {
        $token = $input['token'] ?? '';
        if (isset($_SESSION['token']) && $_SESSION['token'] === $token) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Неверное действие']);
    }

    $db->close();
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>