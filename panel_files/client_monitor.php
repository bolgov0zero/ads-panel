<?php

$db_path = '/data/ads.db';
$check_interval = 10; // Интервал проверки в секундах
$offline_threshold = 5; // Порог для оффлайн-статуса в секундах
$log_file = '/var/log/client-monitor.log'; // Единый файл лога для stdout и stderr
$version_check_interval = 60; // Интервал проверки версии в секундах (1 минута)

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
        // Проверяем время последней проверки
        $stmt = $db->prepare("SELECT last_notified_version, last_check_time FROM version_notifications WHERE id = 1");
        if (!$stmt) {
            logMessage("Ошибка подготовки запроса к version_notifications: " . $db->lastErrorMsg());
            return;
        }
        $result = $stmt->execute();
        if (!$result) {
            logMessage("Ошибка выполнения запроса к version_notifications: " . $db->lastErrorMsg());
            return;
        }
        $row = $result->fetchArray(SQLITE3_ASSOC);
        $last_notified_version = $row['last_notified_version'] ?? '';
        $last_check_time = (int)($row['last_check_time'] ?? 0);

        // Пропускаем, если не прошла минута
        $current_time = time();
        if ($current_time - $last_check_time < $version_check_interval) {
            logMessage("Пропуск проверки версии: не прошло $version_check_interval секунд (текущее время: $current_time, последнее: $last_check_time)");
            return;
        }

        // Обновляем время проверки заранее, чтобы предотвратить дублирование
        $update_stmt = $db->prepare("UPDATE version_notifications SET last_check_time = :time WHERE id = 1");
        if (!$update_stmt) {
            logMessage("Ошибка подготовки обновления времени в version_notifications: " . $db->lastErrorMsg());
            return;
        }
        $update_stmt->bindValue(':time', $current_time, SQLITE3_INTEGER);
        $result = $update_stmt->execute();
        if (!$result) {
            logMessage("Ошибка обновления времени в version_notifications: " . $db->lastErrorMsg());
            return;
        }

        // Получаем имя системы
        $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
        if (!$stmt) {
            logMessage("Ошибка подготовки запроса к system_settings: " . $db->lastErrorMsg());
            return;
        }
        $result = $stmt->execute();
        $system_settings = $result->fetchArray(SQLITE3_ASSOC);
        $system_name = $system_settings['system_name'] ?? 'Ads Panel';

        // Получаем локальную версию и заметку
        $local_version_file = '/var/www/html/version.json';
        if (!file_exists($local_version_file)) {
            logMessage("Ошибка: Файл версии не найден: $local_version_file");
            return;
        }
        $local_data = json_decode(file_get_contents($local_version_file), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            logMessage("Ошибка декодирования локального JSON: " . json_last_error_msg());
            return;
        }
        $local_version_raw = $local_data['version'] ?? '';
        $local_version = ltrim($local_version_raw, 'v');
        $local_note = $local_data['note'] ?? '';
        
        // Скачиваем версию с GitHub
        $github_url = 'https://raw.githubusercontent.com/bolgov0zero/ads-panel/refs/heads/main/version.json';
        $ch = curl_init($github_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $github_data_raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);
        
        if ($httpCode !== 200 || empty($github_data_raw)) {
            logMessage("Ошибка скачивания версии с GitHub: HTTP $httpCode, Ошибка: $curl_error");
            return;
        }
        
        $github_data = json_decode($github_data_raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            logMessage("Ошибка декодирования GitHub JSON: " . json_last_error_msg());
            return;
        }
        $github_version_raw = $github_data['version'] ?? '';
        $github_version = ltrim($github_version_raw, 'v');
        $github_note = $github_data['note'] ?? '';
        
        logMessage("Проверка версий: Локальная '$local_version_raw', GitHub '$github_version_raw'");
        
        // Сравниваем версии
        if (version_compare($github_version, $local_version) > 0 && $github_version_raw !== $last_notified_version) {
            $message = "🆕 <b>Доступна новая версия!</b>\n\n<b>Система:</b> <i>$system_name</i>\n<b>Локальная:</b> <code>$local_version_raw</code>\n<b>GitHub:</b> <code>$github_version_raw</code>\n\n<b>Описание</b>\n<blockquote>$github_note</blockquote>";
            if (!empty($bot_token) && !empty($chat_id)) {
                if (sendTelegramMessage($bot_token, $chat_id, $message)) {
                    $update_stmt = $db->prepare("UPDATE version_notifications SET last_notified_version = :version, last_check_time = :time WHERE id = 1");
                    $update_stmt->bindValue(':version', $github_version_raw, SQLITE3_TEXT);
                    $update_stmt->bindValue(':time', $current_time, SQLITE3_INTEGER);
                    $update_stmt->execute();
                    logMessage("Уведомление о новой версии отправлено: $github_version_raw");
                }
            }
        }
    } catch (Exception $e) {
        logMessage("Ошибка в checkForNewVersion: " . $e->getMessage());
    }
}

try {
    // Подключение к базе данных
    $db = new SQLite3($db_path);
    $db->busyTimeout(5000);
    logMessage("Подключение к базе данных успешно");

    // Загружаем настройки Telegram и имя системы
    $stmt = $db->prepare("SELECT bot_token, chat_id FROM telegram_settings WHERE id = 1");
    if (!$stmt) {
        logMessage("Ошибка подготовки запроса к telegram_settings: " . $db->lastErrorMsg());
        throw new Exception("Не удалось загрузить настройки Telegram");
    }
    $result = $stmt->execute();
    $telegram_settings = $result->fetchArray(SQLITE3_ASSOC);
    $bot_token = $telegram_settings['bot_token'] ?? '';
    $chat_id = $telegram_settings['chat_id'] ?? '';
    logMessage("Загружены настройки Telegram: bot_token=" . ($bot_token ? 'установлен' : 'пустой') . ", chat_id=" . ($chat_id ? 'установлен' : 'пустой'));

    $stmt = $db->prepare("SELECT system_name FROM system_settings WHERE id = 1");
    if (!$stmt) {
        logMessage("Ошибка подготовки запроса к system_settings: " . $db->lastErrorMsg());
        throw new Exception("Не удалось загрузить имя системы");
    }
    $result = $stmt->execute();
    $system_settings = $result->fetchArray(SQLITE3_ASSOC);
    $system_name = $system_settings['system_name'] ?? 'Ads Panel';
    logMessage("Загружено имя системы: $system_name");

    // Проверяем настройки Telegram
    if (empty($bot_token) || empty($chat_id)) {
        logMessage("Предупреждение: Настройки Telegram не заполнены, уведомления не будут отправляться");
    }

    // Сохраняем предыдущие статусы устройств
    $previous_statuses = [];

    while (true) {
        logMessage("Начало цикла проверки статусов устройств");

        // Проверяем версию
        checkForNewVersion($db, $bot_token, $chat_id);

        // Получаем текущие статусы устройств
        $result = $db->query("SELECT uuid, name, COALESCE(last_seen, 0) AS last_seen FROM clients");
        if (!$result) {
            logMessage("Ошибка запроса к clients: " . $db->lastErrorMsg());
            sleep($check_interval);
            continue;
        }
        $clients = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['last_seen'] = (int)$row['last_seen'];
            $row['status'] = (time() - $row['last_seen'] <= $offline_threshold) ? 'online' : 'offline';
            $clients[$row['uuid']] = $row;
        }
        logMessage("Найдено устройств: " . count($clients));

        // Сравниваем с предыдущими статусами
        foreach ($clients as $uuid => $client) {
            $previous_status = $previous_statuses[$uuid] ?? null;
            logMessage("Проверка устройства UUID: $uuid, Имя: {$client['name']}, Статус: {$client['status']}, Последнее соединение: {$client['last_seen']}");
            if ($previous_status !== null && $previous_status !== $client['status']) {
                // Статус изменился
                if ($client['status'] === 'online') {
                    $message = "<b>Статус:</b> 🟢 в сети\n\n<b>Система:</b> <i>$system_name</i>\n<b>Имя:</b> <i>{$client['name']}</i>\n<b>UUID:</b> <code>{$uuid}</code>";
                } else {
                    $message = "<b>Статус:</b> 🔴 не в сети\n\n<b>Система:</b> <i>$system_name</i>\n<b>Имя:</b> <i>{$client['name']}</i>\n<b>UUID:</b> <code>{$uuid}</code>";
                }
                logMessage("Обнаружено изменение статуса для UUID: $uuid, Новый статус: {$client['status']}, Сообщение: $message");
                if (!empty($bot_token) && !empty($chat_id)) {
                    sendTelegramMessage($bot_token, $chat_id, $message);
                } else {
                    logMessage("Сообщение не отправлено: отсутствуют настройки Telegram");
                }
            }
        }

        // Обновляем предыдущие статусы
        $previous_statuses = [];
        foreach ($clients as $uuid => $client) {
            $previous_statuses[$uuid] = $client['status'];
        }

        // Ждём перед следующей проверкой
        logMessage("Ожидание $check_interval секунд до следующей проверки");
        sleep($check_interval);
    }
} catch (Exception $e) {
    logMessage("Критическая ошибка: " . $e->getMessage());
} finally {
    if (isset($db)) {
        $db->close();
        logMessage("Соединение с базой данных закрыто");
    }
}
?>