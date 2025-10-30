<?php

$db_path = '/data/ads.db';
$check_interval = 10; // Интервал проверки в секундах
$offline_threshold = 5; // Порог для оффлайн-статуса в секундах
$log_file = '/var/log/client-monitor.log';
$version_check_interval = 60;

// Функция логирования
function logMessage($message) {
    global $log_file;
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($log_file, "[$timestamp] $message\n", FILE_APPEND);
}

// Функция отправки сообщения в Telegram
function sendTelegramMessage($botToken, $chatId, $message) {
    global $log_file;
    if (empty($botToken) || empty($chatId)) {
        logMessage("Ошибка: Bot Token или Chat ID не указаны");
        return false;
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
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($httpCode !== 200) {
        logMessage("Ошибка отправки сообщения в Telegram: HTTP $httpCode, Ответ: $response");
        return false;
    }
    logMessage("Сообщение отправлено в Telegram: $message");
    return true;
}

// Функция проверки новой версии
function checkForNewVersion($db, $bot_token, $chat_id) {
    global $log_file, $version_check_interval;

    try {
        $stmt = $db->prepare("SELECT last_notified_version, last_check_time FROM version_notifications WHERE id = 1");
        if (!$stmt) return;
        $result = $stmt->execute();
        if (!$result) return;
        $row = $result->fetchArray(SQLITE3_ASSOC);
        $last_notified_version = $row['last_notified_version'] ?? '';
        $last_check_time = (int)($row['last_check_time'] ?? 0);

        $current_time = time();
        if ($current_time - $last_check_time < $version_check_interval) return;

        $update_stmt = $db->prepare("UPDATE version_notifications SET last_check_time = :time WHERE id = 1");
        if (!$update_stmt) return;
        $update_stmt->bindValue(':time', $current_time, SQLITE3_INTEGER);
        $update_stmt->execute();

        $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
        if (!$stmt) return;
        $result = $stmt->execute();
        $system_settings = $result->fetchArray(SQLITE3_ASSOC);
        $system_name = $system_settings['system_name'] ?? 'Ads Panel';

        $local_version_file = '/var/www/html/version.json';
        if (!file_exists($local_version_file)) return;
        $local_data = json_decode(file_get_contents($local_version_file), true);
        if (json_last_error() !== JSON_ERROR_NONE) return;
        $local_version_raw = $local_data['version'] ?? '';
        $local_version = ltrim($local_version_raw, 'v');

        $github_url = 'https://raw.githubusercontent.com/bolgov0zero/ads-panel/refs/heads/main/version.json';
        $ch = curl_init($github_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $github_data_raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || empty($github_data_raw)) return;

        $github_data = json_decode($github_data_raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) return;
        $github_version_raw = $github_data['version'] ?? '';
        $github_version = ltrim($github_version_raw, 'v');
        $github_note = $github_data['note'] ?? '';

        if (version_compare($github_version, $local_version) > 0 && $github_version_raw !== $last_notified_version) {
            $message = "Новая версия!\n\nСистема: <i>$system_name</i>\nЛокальная: <code>$local_version_raw</code>\nGitHub: <code>$github_version_raw</code>\n\nОписание:\n<blockquote>$github_note</blockquote>";
            if (!empty($bot_token) && !empty($chat_id)) {
                if (sendTelegramMessage($bot_token, $chat_id, $message)) {
                    $update_stmt = $db->prepare("UPDATE version_notifications SET last_notified_version = :version, last_check_time = :time WHERE id = 1");
                    $update_stmt->bindValue(':version', $github_version_raw, SQLITE3_TEXT);
                    $update_stmt->bindValue(':time', $current_time, SQLITE3_INTEGER);
                    $update_stmt->execute();
                }
            }
        }
    } catch (Exception $e) {
        logMessage("Ошибка в checkForNewVersion: " . $e->getMessage());
    }
}

try {
    $db = new SQLite3($db_path);
    $db->busyTimeout(5000);
    logMessage("Подключение к базе данных успешно");

    // Загрузка настроек
    $stmt = $db->prepare("SELECT bot_token, chat_id FROM telegram_settings WHERE id = 1");
    $result = $stmt->execute();
    $telegram_settings = $result->fetchArray(SQLITE3_ASSOC);
    $bot_token = $telegram_settings['bot_token'] ?? '';
    $chat_id = $telegram_settings['chat_id'] ?? '';

    $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
    $result = $stmt->execute();
    $system_settings = $result->fetchArray(SQLITE3_ASSOC);
    $system_name = $system_settings['system_name'] ?? 'Ads Panel';

    if (empty($bot_token) || empty($chat_id)) {
        logMessage("Предупреждение: Настройки Telegram не заполнены");
    }

    // Хранилище предыдущих статусов
    $previous_statuses = []; // uuid => ['online' => ..., 'playback' => ...]

    while (true) {
        logMessage("=== Цикл проверки ===");

        checkForNewVersion($db, $bot_token, $chat_id);

        // Получаем всех клиентов
        $result = $db->query("
            SELECT uuid, name, 
                   COALESCE(last_seen, 0) AS last_seen,
                   COALESCE(playback_status, 'stalled') AS playback_status
            FROM clients
        ");
        if (!$result) {
            logMessage("Ошибка запроса: " . $db->lastErrorMsg());
            sleep($check_interval);
            continue;
        }

        $current_clients = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $uuid = $row['uuid'];
            $is_online = (time() - $row['last_seen'] <= $offline_threshold);
            $playback = $row['playback_status'] === 'playing' ? 'playing' : 'stalled';

            $current_clients[$uuid] = [
                'name' => $row['name'],
                'online' => $is_online,
                'playback' => $playback
            ];

            $prev = $previous_statuses[$uuid] ?? null;

            // --- Проверка смены онлайн-статуса ---
            if ($prev && $prev['online'] != $is_online) {
                $status_text = $is_online ? "в сети" : "не в сети";
                $emoji = $is_online ? "Зелёный круг" : "Красный круг";
                $message = "<b>Статус:</b> $emoji $status_text\n\n<b>Система:</b> <i>$system_name</i>\n<b>Имя:</b> <i>{$row['name']}</i>\n<b>UUID:</b> <code>$uuid</code>";
                logMessage("Онлайн-статус изменён: $uuid → $status_text");
                if (!empty($bot_token) && !empty($chat_id)) {
                    sendTelegramMessage($bot_token, $chat_id, $message);
                }
            }

            // --- Проверка смены статуса воспроизведения ---
            if ($prev && $prev['playback'] != $playback) {
                $playback_text = $playback === 'playing' ? "воспроизведение" : "остановлено";
                $emoji = $playback === 'playing' ? "Зелёная кнопка" : "Красная кнопка";
                $message = "<b>Воспроизведение:</b> $emoji $playback_text\n\n<b>Система:</b> <i>$system_name</i>\n<b>Имя:</b> <i>{$row['name']}</i>\n<b>UUID:</b> <code>$uuid</code>";
                logMessage("Статус воспроизведения изменён: $uuid → $playback_text");
                if (!empty($bot_token) && !empty($chat_id)) {
                    sendTelegramMessage($bot_token, $chat_id, $message);
                }
            }
        }

        // Сохраняем текущие статусы
        $previous_statuses = $current_clients;

        logMessage("Ожидание $check_interval секунд...");
        sleep($check_interval);
    }

} catch (Exception $e) {
    logMessage("Критическая ошибка: " . $e->getMessage());
} finally {
    if (isset($db)) {
        $db->close();
        logMessage("Соединение с БД закрыто");
    }
}
?>