<?php
header('Content-Type: application/json');

try {
    // Подключение к SQLite3
    $db = new SQLite3('/data/ads.db');
    $db->busyTimeout(5000); // Устанавливаем таймаут для занятой базы данных

    // Обработка запросов
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $_POST['action'] ?? $_GET['action'] ?? $input['action'] ?? '';

    // Обновление времени последнего запроса для действий, связанных с клиентом
    if (in_array($action, ['add_client', 'get_client_info', 'list_client_content'])) {
        $uuid = $_GET['uuid'] ?? $input['uuid'] ?? '';
        if (!empty($uuid)) {
            $stmt = $db->prepare("UPDATE clients SET last_seen = :last_seen WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':last_seen', time(), SQLITE3_INTEGER);
            $stmt->execute();
        }
    }

    switch ($action) {
        case 'upload_file':
            $uploadDir = '/opt/ads/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $errors = [
                    UPLOAD_ERR_INI_SIZE => 'Файл превышает upload_max_filesize',
                    UPLOAD_ERR_FORM_SIZE => 'Файл превышает MAX_FILE_SIZE',
                    UPLOAD_ERR_PARTIAL => 'Файл загружен частично',
                    UPLOAD_ERR_NO_FILE => 'Файл не загружен',
                    UPLOAD_ERR_NO_TMP_DIR => 'Отсутствует временная папка',
                    UPLOAD_ERR_CANT_WRITE => 'Ошибка записи файла',
                    UPLOAD_ERR_EXTENSION => 'Загрузка прервана расширением'
                ];
                $error = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
                echo json_encode(['error' => $errors[$error] ?? 'Неизвестная ошибка загрузки']);
                break;
            }
            $fileFile = $uploadDir . basename($_FILES['file']['name']);
            $fileUrl = '/files/' . basename($_FILES['file']['name']);
            $name = basename($_FILES['file']['name']);
            $extension = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
            $fileType = in_array($extension, ['mp4']) ? 'video' : (in_array($extension, ['pdf']) ? 'pdf' : null);
            if (!$fileType) {
                echo json_encode(['error' => 'Файл должен быть в формате MP4 или PDF']);
                break;
            }
            $duration = $fileType === 'pdf' ? 5 : null; // По умолчанию 5 секунд для PDF
            if (move_uploaded_file($_FILES['file']['tmp_name'], $fileFile)) {
                $stmt = $db->prepare("INSERT INTO files (file_url, name, type, duration, order_num, is_default) SELECT :url, :name, :type, :duration, COALESCE(MAX(order_num) + 1, 1), 0 FROM files");
                $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
                $stmt->bindValue(':name', $name, SQLITE3_TEXT);
                $stmt->bindValue(':type', $fileType, SQLITE3_TEXT);
                $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
                $stmt->execute();
                echo json_encode(['message' => 'Файл загружен']);
            } else {
                echo json_encode(['error' => 'Не удалось переместить файл']);
            }
            break;

        case 'scan_files':
            $uploadDir = '/opt/ads/';
            if (!is_dir($uploadDir)) {
                echo json_encode(['error' => 'Папка /opt/ads/ не существует']);
                break;
            }
            $files = scandir($uploadDir);
            $newFiles = 0;
            foreach ($files as $file) {
                $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                $fileType = in_array($extension, ['mp4']) ? 'video' : (in_array($extension, ['pdf']) ? 'pdf' : null);
                if ($fileType) {
                    $fileFile = $uploadDir . $file;
                    $fileUrl = '/files/' . $file;
                    $name = $file;
                    $duration = $fileType === 'pdf' ? 5 : null;
                    $stmt = $db->prepare("SELECT COUNT(*) FROM files WHERE file_url = :url");
                    $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
                    $result = $stmt->execute()->fetchArray(SQLITE3_NUM)[0];
                    if ($result === 0) {
                        $stmt = $db->prepare("INSERT INTO files (file_url, name, type, duration, order_num, is_default) SELECT :url, :name, :type, :duration, COALESCE(MAX(order_num) + 1, 1), 0 FROM files");
                        $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
                        $stmt->bindValue(':name', $name, SQLITE3_TEXT);
                        $stmt->bindValue(':type', $fileType, SQLITE3_TEXT);
                        $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
                        $stmt->execute();
                        $newFiles++;
                    }
                }
            }
            echo json_encode(['message' => "Добавлено новых файлов: $newFiles"]);
            break;

        case 'add_client':
            $uuid = $input['uuid'] ?? '';
            $name = $input['name'] ?? 'Без имени';
            $show_info = isset($input['show_info']) ? (int)$input['show_info'] : 1;
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("INSERT OR IGNORE INTO clients (uuid, name, show_info, last_seen) VALUES (:uuid, :name, :show_info, :last_seen)");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->bindValue(':show_info', $show_info, SQLITE3_INTEGER);
            $stmt->bindValue(':last_seen', time(), SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Клиент добавлен']);
            break;

        case 'list_files':
            $result = $db->query("SELECT id, file_url, name, type, duration, order_num, is_default FROM files ORDER BY order_num");
            $files = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $files[] = $row;
            }
            echo json_encode($files);
            break;

        case 'list_clients':
            $result = $db->query("SELECT uuid, name, show_info, last_seen, (last_seen >= strftime('%s', 'now') - 5) AS status FROM clients");
            $clients = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $row['status'] = $row['status'] ? 'online' : 'offline';
                $clients[] = $row;
            }
            echo json_encode($clients);
            break;

        case 'count_clients':
            $count = $db->querySingle("SELECT COUNT(*) FROM clients");
            echo json_encode(['count' => $count]);
            break;

        case 'list_client_content':
            $uuid = $_GET['uuid'] ?? $input['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode([]);
                break;
            }
            $stmt = $db->prepare("
                SELECT f.id, f.file_url, f.name, f.type, f.duration, f.order_num, cc.uuid IS NOT NULL AS enabled
                FROM files f
                LEFT JOIN client_content cc ON cc.content_id = f.id AND cc.content_type = f.type AND cc.uuid = :uuid
                WHERE f.is_default = 0
                ORDER BY f.order_num
            ");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $result = $stmt->execute();
            $content = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $content[] = $row;
            }
            echo json_encode($content);
            break;

        // НОВОЕ ДЕЙСТВИЕ: Получение всего контента для всех клиентов
        case 'list_all_client_content':
            $stmt = $db->prepare("
                SELECT cc.uuid, cc.content_id, cc.content_type, f.name 
                FROM client_content cc
                JOIN files f ON cc.content_id = f.id AND cc.content_type = f.type
            ");
            $result = $stmt->execute();
            $content = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $content[] = $row;
            }
            echo json_encode($content);
            break;

        case 'update_file_name':
            $id = $input['id'] ?? 0;
            $name = $input['name'] ?? '';
            if ($id <= 0 || empty($name)) {
                echo json_encode(['error' => 'Неверные параметры']);
                break;
            }
            $stmt = $db->prepare("UPDATE files SET name = :name WHERE id = :id AND is_default = 0");
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Имя файла обновлено']);
            break;

        case 'update_file_duration':
            $id = $input['id'] ?? 0;
            $duration = $input['duration'] ?? null;
            if ($id <= 0) {
                echo json_encode(['error' => 'Неверный ID']);
                break;
            }
            $stmt = $db->prepare("UPDATE files SET duration = :duration WHERE id = :id");
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
            $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Продолжительность обновлена']);
            break;

        case 'update_file_order':
            $id = $input['id'] ?? 0;
            $order = $input['order'] ?? 0;
            if ($id <= 0) {
                echo json_encode(['error' => 'Неверный ID']);
                break;
            }
            $stmt = $db->prepare("UPDATE files SET order_num = :order WHERE id = :id");
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
            $stmt->bindValue(':order', $order, SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Порядок файла обновлён']);
            break;

        case 'delete_file':
            $id = $input['id'] ?? 0;
            if ($id <= 0) {
                echo json_encode(['error' => 'Неверный ID файла']);
                break;
            }
            $stmt = $db->prepare("SELECT file_url FROM files WHERE id = :id AND is_default = 0");
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
            $result = $stmt->execute();
            if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $filePath = str_replace('/files/', '/opt/ads/', $row['file_url']);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
                $db->exec("DELETE FROM files WHERE id = $id");
                $db->exec("DELETE FROM client_content WHERE content_id = $id");
                echo json_encode(['message' => 'Файл удалён']);
            } else {
                echo json_encode(['error' => 'Файл не найден или является системным']);
            }
            break;

        case 'delete_client':
            $uuid = $input['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $db->exec("DELETE FROM clients WHERE uuid = '$uuid'");
            $db->exec("DELETE FROM client_content WHERE uuid = '$uuid'");
            echo json_encode(['message' => 'Клиент удалён']);
            break;

        case 'update_client_name':
            $uuid = $input['uuid'] ?? '';
            $name = $input['name'] ?? '';
            if (empty($uuid) || empty($name)) {
                echo json_encode(['error' => 'Неверные параметры']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET name = :name WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Имя клиента обновлено']);
            break;

        case 'update_client_show_info':
            $uuid = $input['uuid'] ?? '';
            $show_info = $input['show_info'] ?? 0;
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET show_info = :show_info WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':show_info', $show_info ? 1 : 0, SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Настройка отображения обновлена']);
            break;

        case 'update_client_content':
            $uuid = $input['uuid'] ?? '';
            $content_id = $input['content_id'] ?? 0;
            $content_type = $input['content_type'] ?? 'video';
            $enabled = $input['enabled'] ?? false;
            if (empty($uuid) || $content_id <= 0) {
                echo json_encode(['error' => 'Неверный UUID или content_id']);
                break;
            }
            // Проверяем, что content_id не является системным файлом
            $stmt = $db->prepare("SELECT is_default FROM files WHERE id = :id");
            $stmt->bindValue(':id', $content_id, SQLITE3_INTEGER);
            $result = $stmt->execute();
            $is_default = $result->fetchArray(SQLITE3_ASSOC)['is_default'] ?? 0;
            if ($is_default) {
                echo json_encode(['error' => 'Системный файл не может быть назначен']);
                break;
            }
            if ($enabled) {
                $stmt = $db->prepare("INSERT OR REPLACE INTO client_content (uuid, content_id, content_type) VALUES (:uuid, :id, :type)");
                $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
                $stmt->bindValue(':id', $content_id, SQLITE3_INTEGER);
                $stmt->bindValue(':type', $content_type, SQLITE3_TEXT);
                $stmt->execute();
                echo json_encode(['message' => 'Контент назначен']);
            } else {
                $stmt = $db->prepare("DELETE FROM client_content WHERE uuid = :uuid AND content_id = :id AND content_type = :type");
                $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
                $stmt->bindValue(':id', $content_id, SQLITE3_INTEGER);
                $stmt->bindValue(':type', $content_type, SQLITE3_TEXT);
                $stmt->execute();
                echo json_encode(['message' => 'Контент снят']);
            }
            break;

        case 'update_message_settings':
            $enabled = isset($input['enabled']) ? (int)$input['enabled'] : 0;
            $text = $input['text'] ?? '';
            $color = $input['color'] ?? '#ffffff';
            $font_size = $input['font_size'] ?? 24;
            $speed = $input['speed'] ?? 100;
            $bold = isset($input['bold']) ? (int)$input['bold'] : 0;
            $background_color = $input['background_color'] ?? '#000000';
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO message_settings (id, enabled, text, color, font_size, speed, bold, background_color)
                VALUES (1, :enabled, :text, :color, :font_size, :speed, :bold, :background_color)
            ");
            $stmt->bindValue(':enabled', $enabled, SQLITE3_INTEGER);
            $stmt->bindValue(':text', $text, SQLITE3_TEXT);
            $stmt->bindValue(':color', $color, SQLITE3_TEXT);
            $stmt->bindValue(':font_size', $font_size, SQLITE3_INTEGER);
            $stmt->bindValue(':speed', $speed, SQLITE3_INTEGER);
            $stmt->bindValue(':bold', $bold, SQLITE3_INTEGER);
            $stmt->bindValue(':background_color', $background_color, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Настройки сообщения обновлены']);
            break;

        case 'get_message_settings':
            $stmt = $db->prepare("SELECT enabled, text, color, font_size, speed, bold, background_color FROM message_settings WHERE id = 1");
            $result = $stmt->execute();
            if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                echo json_encode($row);
            } else {
                echo json_encode(['enabled' => 0, 'text' => '', 'color' => '#ffffff', 'font_size' => 24, 'speed' => 100, 'bold' => 0, 'background_color' => '#000000']);
            }
            break;

        default:
            echo json_encode(['error' => 'Неверное действие']);
    }
} catch (Exception $e) {
    echo json_encode(['error' => 'Ошибка сервера: ' . $e->getMessage()]);
} finally {
    if (isset($db)) {
        $db->close();
    }
}
?>