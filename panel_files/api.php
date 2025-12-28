<?php
// Suppress output to prevent warnings from corrupting JSON
ob_start();
header('Content-Type: application/json; charset=UTF-8');

// Функция для логирования
function logMessage($message) {
    error_log(date('[Y-m-d H:i:s] ') . $message . "\n", 3, '/var/log/ads_api.log');
}

try {
    // Подключение к SQLite3
    $db = new SQLite3('/data/ads.db');
    $db->busyTimeout(5000);

    // Проверка корректности входного JSON
    $input = file_get_contents('php://input');
    $input_data = json_decode($input, true);
    if ($input !== '' && json_last_error() !== JSON_ERROR_NONE) {
        logMessage("Ошибка декодирования JSON: " . json_last_error_msg());
        header('HTTP/1.1 400 Bad Request');
        echo json_encode(['error' => 'Некорректный JSON в запросе']);
        ob_end_flush();
        exit;
    }
    $action = $_POST['action'] ?? $_GET['action'] ?? $input_data['action'] ?? '';
    logMessage("Получен запрос: action=$action");

    // Функция отправки сообщения в Telegram
    function sendTelegramMessage($botToken, $chatId, $message) {
        if (empty($botToken) || empty($chatId)) {
            return ['error' => 'Bot Token или Chat ID не указаны'];
        }
    
        // Приводим chat_id к числу, если это группа/канал
        $chatId = ltrim($chatId, '@'); // убираем @
        if (is_numeric($chatId)) {
            $chatId = (int)$chatId;
        }
    
        $url = "https://api.telegram.org/bot$botToken/sendMessage";
        $data = [
            'chat_id' => $chatId,
            'text' => $message,
            'parse_mode' => 'HTML'
        ];
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
    
        if ($httpCode !== 200) {
            $errorMsg = "HTTP $httpCode";
            if ($curlError) $errorMsg .= ", cURL: $curlError";
            if ($response) {
                $resp = json_decode($response, true);
                if ($resp && isset($resp['description'])) {
                    $errorMsg .= ", Telegram: " . $resp['description'];
                }
            }
            logMessage("Telegram error: $errorMsg");
            return ['error' => 'Ошибка отправки: ' . $errorMsg];
        }
        return json_decode($response, true);
    }

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
            $thumbDir = '/opt/ads/thumbnails/';
            
            // Создаём папки
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            if (!is_dir($thumbDir)) mkdir($thumbDir, 0755, true);
            
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
            
            $fileName = basename($_FILES['file']['name']);
            $filePath = $uploadDir . $fileName;
            $fileUrl = '/files/' . $fileName;
            $thumbName = 'thumb_' . $fileName . '.jpg';
            $thumbPath = $thumbDir . $thumbName;
            $thumbUrl = '/files/thumbnails/' . $thumbName;
            
            $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            $fileType = in_array($extension, ['mp4']) ? 'video' : (in_array($extension, ['pdf']) ? 'pdf' : null);
            
            if (!$fileType) {
                echo json_encode(['error' => 'Файл должен быть в формате MP4 или PDF']);
                break;
            }
            
            // === 1. Перемещаем файл ===
            if (!move_uploaded_file($_FILES['file']['tmp_name'], $filePath)) {
                echo json_encode(['error' => 'Не удалось сохранить файл']);
                break;
            }
            
            // === 2. Генерация превью ===
            $thumbnail = '';
            if ($fileType === 'video') {
                $cmd = "ffmpeg -i " . escapeshellarg($filePath) . " -ss 00:00:01 -vframes 1 -y " . escapeshellarg($thumbPath) . " 2>/dev/null";
                exec($cmd, $output, $returnCode);
                if ($returnCode === 0 && file_exists($thumbPath)) {
                    $thumbnail = $thumbUrl;
                }
            } else {
                $cmd = "convert -density 150 " . escapeshellarg($filePath . '[0]') . " -thumbnail 300x200 -quality 85 " . escapeshellarg($thumbPath) . " 2>/dev/null";
                exec($cmd, $output, $returnCode);
                if ($returnCode === 0 && file_exists($thumbPath)) {
                    $thumbnail = $thumbUrl;
                }
            }
            
            // === 3. Получаем длительность для видео ===
            $duration = $fileType === 'pdf' ? 5 : null;
            if ($fileType === 'video') {
                $cmd = "ffprobe -v quiet -show_entries format=duration -of csv=p=0 " . escapeshellarg($filePath);
                $output = shell_exec($cmd);
                $durationFloat = $output ? floatval(trim($output)) : null;
                $duration = $durationFloat ? round($durationFloat) : null;
            }
            
            // === 4. Добавляем в БД ===
            $stmt = $db->prepare("
                INSERT INTO files 
                (file_url, name, type, duration, order_num, is_default, thumbnail) 
                VALUES (:url, :name, :type, :duration, 
                        COALESCE((SELECT MAX(order_num) FROM files), 0) + 1, 
                        0, :thumbnail)
            ");
            $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
            $stmt->bindValue(':name', $fileName, SQLITE3_TEXT);
            $stmt->bindValue(':type', $fileType, SQLITE3_TEXT);
            $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
            $stmt->bindValue(':thumbnail', $thumbnail, SQLITE3_TEXT);
            
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Файл загружен']);
            } else {
                echo json_encode(['error' => 'Ошибка добавления в БД']);
            }
            break;

        case 'update_client_show_info':
            $uuid = $input['uuid'] ?? '';
            $show_info = isset($input['show_info']) ? (int)$input['show_info'] : 0;
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET show_info = :show_info WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':show_info', $show_info, SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Отображение UUID обновлено']);
            break;

        case 'scan_files':
            $uploadDir = '/opt/ads/';
            $thumbDir = '/opt/ads/thumbnails/';
            
            // Создаём папки
            if (!is_dir($uploadDir)) {
                echo json_encode(['error' => 'Папка /opt/ads/ не существует']);
                break;
            }
            if (!is_dir($thumbDir)) {
                mkdir($thumbDir, 0755, true);
            }
            
            $files = scandir($uploadDir);
            $newFiles = 0;
            $errors = [];
            
            foreach ($files as $file) {
                // Пропускаем . и ..
                if ($file === '.' || $file === '..') continue;
            
                // Исключаем системный файл ads.pdf
                if ($file === 'ads.pdf') continue;
            
                $filePath = $uploadDir . $file;
                $fileUrl = '/files/' . $file;
            
                // Проверяем, это файл и не директория
                if (!is_file($filePath)) continue;
            
                $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                $fileType = in_array($extension, ['mp4']) ? 'video' : (in_array($extension, ['pdf']) ? 'pdf' : null);
            
                // Пропускаем неподдерживаемые форматы
                if (!$fileType) continue;
            
                // Проверяем, уже есть ли файл в БД
                $stmt = $db->prepare("SELECT COUNT(*) FROM files WHERE file_url = :url");
                $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
                $count = $stmt->execute()->fetchArray(SQLITE3_NUM)[0];
                if ($count > 0) continue; // Уже есть — пропускаем
            
                // Генерируем превью
                $thumbName = 'thumb_' . $file . '.jpg';
                $thumbPath = $thumbDir . $thumbName;
                $thumbUrl = '/files/thumbnails/' . $thumbName;
                $thumbnail = '';
            
                if ($fileType === 'video') {
                    $cmd = "ffmpeg -i " . escapeshellarg($filePath) . " -ss 00:00:01 -vframes 1 -y " . escapeshellarg($thumbPath) . " 2>/dev/null";
                    exec($cmd, $output, $returnCode);
                    if ($returnCode === 0 && file_exists($thumbPath)) {
                        $thumbnail = $thumbUrl;
                    }
                } else { // pdf
                    $cmd = "convert -density 150 " . escapeshellarg($filePath . '[0]') . " -thumbnail 300x200 -quality 85 " . escapeshellarg($thumbPath) . " 2>/dev/null";
                    exec($cmd, $output, $returnCode);
                    if ($returnCode === 0 && file_exists($thumbPath)) {
                        $thumbnail = $thumbUrl;
                    }
                }
            
                $duration = $fileType === 'pdf' ? 5 : null;
            
                // Добавляем в БД
                $stmt = $db->prepare("
                    INSERT INTO files 
                    (file_url, name, type, duration, order_num, is_default, thumbnail) 
                    VALUES (:url, :name, :type, :duration, 
                            COALESCE((SELECT MAX(order_num) FROM files), 0) + 1, 
                            0, :thumbnail)
                ");
                $stmt->bindValue(':url', $fileUrl, SQLITE3_TEXT);
                $stmt->bindValue(':name', $file, SQLITE3_TEXT);
                $stmt->bindValue(':type', $fileType, SQLITE3_TEXT);
                $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
                $stmt->bindValue(':thumbnail', $thumbnail, SQLITE3_TEXT);
            
                if ($stmt->execute()) {
                    $newFiles++;
                } else {
                    $errors[] = "Не удалось добавить $file";
                }
            }
            
            $message = "Сканирование завершено. Добавлено файлов: $newFiles";
            if (!empty($errors)) {
                $message .= ". Ошибки: " . implode('; ', $errors);
            }
            
            echo json_encode(['message' => $message]);
            break;

        case 'add_client':
            $uuid = $input['uuid'] ?? '';
            $name = $input['name'] ?? 'Без имени';
            $show_info = isset($input['show_info']) ? (int)$input['show_info'] : 1; // По умолчанию показываем
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            // Вставка клиента
            $stmt = $db->prepare("INSERT OR REPLACE INTO clients (uuid, name, show_info, last_seen) VALUES (:uuid, :name, :show_info, :last_seen)");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->bindValue(':show_info', $show_info, SQLITE3_INTEGER);
            $stmt->bindValue(':last_seen', time(), SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Клиент создан']);
            break;

        case 'get_client_info':
            $uuid = $_GET['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("SELECT name, show_info, last_seen, playback_status FROM clients WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $result = $stmt->execute();
            if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $row['status'] = (time() - $row['last_seen']) <= 60 ? 'online' : 'offline';
                echo json_encode($row);
            } else {
                echo json_encode(['error' => 'Устройство не найдено']);
            }
            break;

        case 'update_client_name':
            $uuid = $input['uuid'] ?? '';
            $name = $input['name'] ?? 'Без имени';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET name = :name WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Имя клиента обновлено']);
            break;

        case 'update_file_name':
            $id = $input['id'] ?? 0;
            $name = $input['name'] ?? '';
            if ($id <= 0 || empty($name)) {
                echo json_encode(['error' => 'Неверный ID или имя']);
                break;
            }
            $stmt = $db->prepare("UPDATE files SET name = :name WHERE id = :id AND is_default = 0");
            $stmt->bindValue(':name', $name, SQLITE3_TEXT);
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
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
            $stmt = $db->prepare("UPDATE files SET duration = :duration WHERE id = :id AND type = 'pdf' AND is_default = 0");
            $stmt->bindValue(':duration', $duration, $duration === null ? SQLITE3_NULL : SQLITE3_INTEGER);
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
            $stmt->execute();
            echo json_encode(['message' => 'Продолжительность файла обновлена']);
            break;

        case 'list_files':
            $stmt = $db->prepare("
                SELECT id, file_url, name, type, duration, order_num, thumbnail 
                FROM files 
                WHERE is_default = 0 
                ORDER BY order_num ASC
            ");
            $result = $stmt->execute();
            $files = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $row['duration'] = $row['duration'] !== null ? (int)$row['duration'] : null;
                if (empty($row['thumbnail'])) {
                    $row['thumbnail'] = $row['type'] === 'video' 
                        ? '/assets/video-placeholder.jpg' 
                        : '/assets/pdf-placeholder.jpg';
                }
                $files[] = $row;
            }
            echo json_encode($files);
            break;

        case 'list_clients':
            $result = $db->query("SELECT uuid, name, show_info, last_seen, playback_status FROM clients");
            $clients = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $row['status'] = (time() - $row['last_seen']) <= 60 ? 'online' : 'offline';
                $clients[] = $row;
            }
            echo json_encode($clients);
            logMessage("Список клиентов возвращён, количество: " . count($clients) . ", статусы: " . json_encode(array_map(function($c) { return $c['playback_status']; }, $clients)));
            break;

        case 'count_clients':
            $result = $db->querySingle("SELECT COUNT(*) FROM clients");
            echo json_encode(['count' => (int)$result]);
            logMessage("Возвращено количество клиентов: $result");
            break;

        case 'list_client_content':
            $uuid = $_GET['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("
                SELECT f.id, f.file_url, f.name, f.order_num, f.type, f.duration
                FROM files f
                JOIN client_content cc ON f.id = cc.content_id AND cc.content_type = f.type
                WHERE cc.uuid = :uuid AND f.is_default = 0
                ORDER BY f.order_num ASC
            ");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $result = $stmt->execute();
            $content = [];
            while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                $content[] = $row;
            }
            // Если контента нет, возвращаем ads.pdf
            if (empty($content)) {
                $stmt = $db->prepare("SELECT id, file_url, name, order_num, type, duration FROM files WHERE is_default = 1");
                $result = $stmt->execute();
                if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                    $content[] = $row;
                }
            }
            echo json_encode($content);
            break;

        case 'update_file_order':
            $id = $input['id'] ?? 0;
            $order = $input['order'] ?? 0;
            if ($id <= 0 || $order < 0) {
                echo json_encode(['error' => 'Неверный ID или порядок']);
                break;
            }
            $stmt = $db->prepare("UPDATE files SET order_num = :order WHERE id = :id AND is_default = 0");
            $stmt->bindValue(':order', $order, SQLITE3_INTEGER);
            $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
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
            
        case 'get_system_name':
            $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
            $result = $stmt->execute();
            if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                echo json_encode($row);
            } else {
                echo json_encode(['system_name' => 'Ads Panel']);
            }
            break;
        
        case 'update_system_name':
            $system_name = $input['system_name'] ?? 'Ads Panel';
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO system_settings (id, system_name)
                VALUES (1, :system_name)
            ");
            $stmt->bindValue(':system_name', $system_name, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Имя системы обновлено']);
            break;
        
        case 'get_telegram_settings':
            $stmt = $db->prepare("SELECT bot_token, chat_id FROM telegram_settings WHERE id = 1");
            $result = $stmt->execute();
            if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
                echo json_encode($row);
            } else {
                echo json_encode(['bot_token' => '', 'chat_id' => '']);
            }
            break;
        
        case 'update_telegram_settings':
            $bot_token = $input['bot_token'] ?? '';
            $chat_id = $input['chat_id'] ?? '';
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO telegram_settings (id, bot_token, chat_id)
                VALUES (1, :bot_token, :chat_id)
            ");
            $stmt->bindValue(':bot_token', $bot_token, SQLITE3_TEXT);
            $stmt->bindValue(':chat_id', $chat_id, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Настройки Telegram обновлены']);
            break;
        
        case 'send_test_telegram_message':
            $stmt = $db->prepare("SELECT bot_token, chat_id FROM telegram_settings WHERE id = 1");
            $result = $stmt->execute();
            $settings = $result->fetchArray(SQLITE3_ASSOC);
            $bot_token = $settings['bot_token'] ?? '';
            $chat_id = $settings['chat_id'] ?? '';
            $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
            $result = $stmt->execute();
            $system_settings = $result->fetchArray(SQLITE3_ASSOC);
            $system_name = $system_settings['system_name'] ?? 'Ads Panel';
            $result = sendTelegramMessage($bot_token, $chat_id, "$system_name. Тестовое сообщение.");
            if (isset($result['error'])) {
                echo json_encode(['error' => $result['error']]);
            } else {
                echo json_encode(['message' => 'Тестовое сообщение отправлено']);
            }
            break;
            
        case 'update_playback_status':
            $uuid = $input['uuid'] ?? '';
            $status = $input['status'] ?? 'playing';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            if (!in_array($status, ['playing', 'stalled'])) {
                echo json_encode(['error' => 'Неверный статус воспроизведения']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET playback_status = :status WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->bindValue(':status', $status, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Статус воспроизведения обновлён']);
            break;
        
        case 'restart_playback':
            $uuid = $input_data['uuid'] ?? '';
            if (empty($uuid)) {
                logMessage("Ошибка: UUID не указан для restart_playback");
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET playback_status = 'restart' WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->execute();
            logMessage("Отправлена команда перезапуска для UUID: $uuid");
            echo json_encode(['message' => 'Команда перезапуска отправлена']);
            break;
        
        // ---- 1. Установка флага перезапуска ----
        case 'restart_playback':
            $uuid = $input['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET restart_requested = 1 WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->execute();
            logMessage("restart_playback: flag set for $uuid");
            echo json_encode(['message' => 'Команда перезапуска отправлена']);
            break;
        
        // ---- 2. Сброс флага (вызывается клиентом после выполнения) ----
        case 'clear_restart_flag':
            $uuid = $input['uuid'] ?? '';
            if (empty($uuid)) {
                echo json_encode(['error' => 'UUID не указан']);
                break;
            }
            $stmt = $db->prepare("UPDATE clients SET restart_requested = 0 WHERE uuid = :uuid");
            $stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
            $stmt->execute();
            echo json_encode(['message' => 'Флаг перезапуска сброшен']);
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
        ob_end_flush();
    }
?>