<?php

$db_path = '/data/ads.db';
$check_interval = 10; // Интервал проверки в секундах
$offline_threshold = 60; // Порог для оффлайн-статуса в секундах
$log_file = '/var/log/client-monitor.log';
$version_check_interval = 60;
$resolution_check_interval = 10; // Проверять разрешение
$last_resolution_check = 0;

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

// Функция для получения настроек минимального разрешения
function getResolutionSettings($db) {
    $stmt = $db->prepare("SELECT min_width, min_height FROM resolution_settings WHERE id = 1");
    $result = $stmt->execute();
    if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        return [
            'min_width' => $row['min_width'] ?? 1920,
            'min_height' => $row['min_height'] ?? 1080
        ];
    }
    return ['min_width' => 1920, 'min_height' => 1080];
}

// Функция проверки разрешения и отправки уведомлений
function checkResolutionAndNotify($db, $bot_token, $chat_id, $system_name) {
    global $log_file, $resolution_check_interval, $last_resolution_check;
    
    $current_time = time();
    if ($current_time - $last_resolution_check < $resolution_check_interval) {
        return;
    }
    
    $last_resolution_check = $current_time;
    
    try {
        // Получаем настройки минимального разрешения
        $resolution_settings = getResolutionSettings($db);
        $min_width = $resolution_settings['min_width'];
        $min_height = $resolution_settings['min_height'];
        
        logMessage("Проверка разрешений: мин. {$min_width}×{$min_height}");
        
        // Получаем все устройства с их разрешениями
        $stmt = $db->prepare("
            SELECT 
                c.uuid, 
                c.name, 
                COALESCE(ws.width, 0) as width, 
                COALESCE(ws.height, 0) as height,
                COALESCE(ws.resolution, '') as resolution,
                ws.last_updated as resolution_updated
            FROM clients c
            LEFT JOIN client_window_sizes ws ON c.uuid = ws.uuid
            WHERE c.last_seen > :online_threshold
        ");
        $online_threshold = time() - 60; // Только онлайн устройства
        $stmt->bindValue(':online_threshold', $online_threshold, SQLITE3_INTEGER);
        $result = $stmt->execute();
        
        $low_res_count = 0;
        $good_res_count = 0;
        
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $width = $row['width'] ?? 0;
            $height = $row['height'] ?? 0;
            
            // Пропускаем устройства с неизвестным разрешением
            if ($width <= 0 || $height <= 0) {
                logMessage("Устройство {$row['name']} ({$row['uuid']}): разрешение неизвестно");
                continue;
            }
            
            logMessage("Проверка {$row['name']}: {$width}×{$height} (требуется: {$min_width}×{$min_height})");
            
            // Проверяем соответствие минимальному разрешению
            $is_low_resolution = $width < $min_width || $height < $min_height;
            
            // Проверяем, не отправляли ли уже уведомление для этого устройства
            $notification_key_low = "low_res_{$row['uuid']}_{$min_width}_{$min_height}";
            $notification_key_good = "good_res_{$row['uuid']}_{$min_width}_{$min_height}";
            
            if ($is_low_resolution) {
                $low_res_count++;
                
                $stmt_check = $db->prepare("SELECT COUNT(*) FROM resolution_notifications WHERE notification_key = :key");
                $stmt_check->bindValue(':key', $notification_key_low, SQLITE3_TEXT);
                $notified_low = $stmt_check->execute()->fetchArray(SQLITE3_NUM)[0];
                
                if ($notified_low == 0) {
                    // Отправляем уведомление о низком разрешении
                    $message = "<b>Система:</b> <i>$system_name</i>\n";
                    $message .= "<blockquote><b>Устройство:</b> <i>{$row['name']}</i>\n";
                    $message .= "<b>Монитор:</b> 🚨 аномальное разрешение\n";
                    $message .= "<b>UUID:</b> <code>{$row['uuid']}</code></blockquote>";
                    
                    if (!empty($bot_token) && !empty($chat_id)) {
                        logMessage("Отправка уведомления о низком разрешении для {$row['uuid']}");
                        if (sendTelegramMessage($bot_token, $chat_id, $message)) {
                            // Запоминаем, что отправили уведомление о низком разрешении
                            $stmt_insert = $db->prepare("
                                INSERT OR REPLACE INTO resolution_notifications (uuid, notification_key, sent_at) 
                                VALUES (:uuid, :key, :time)
                            ");
                            $stmt_insert->bindValue(':uuid', $row['uuid'], SQLITE3_TEXT);
                            $stmt_insert->bindValue(':key', $notification_key_low, SQLITE3_TEXT);
                            $stmt_insert->bindValue(':time', $current_time, SQLITE3_INTEGER);
                            $stmt_insert->execute();
                            
                            // Удаляем запись о хорошем разрешении, если она есть
                            $stmt_delete = $db->prepare("DELETE FROM resolution_notifications WHERE notification_key = :key");
                            $stmt_delete->bindValue(':key', $notification_key_good, SQLITE3_TEXT);
                            $stmt_delete->execute();
                            
                            logMessage("Уведомление о низком разрешении отправлено для {$row['uuid']}");
                        }
                    }
                } else {
                    logMessage("Уведомление для {$row['uuid']} уже отправлено ранее");
                }
            } else {
                $good_res_count++;
                
                // Проверяем, было ли уведомление о низком разрешении ранее
                $stmt_check = $db->prepare("SELECT COUNT(*) FROM resolution_notifications WHERE notification_key = :key");
                $stmt_check->bindValue(':key', $notification_key_low, SQLITE3_TEXT);
                $had_low_res = $stmt_check->execute()->fetchArray(SQLITE3_NUM)[0];
                
                $stmt_check = $db->prepare("SELECT COUNT(*) FROM resolution_notifications WHERE notification_key = :key");
                $stmt_check->bindValue(':key', $notification_key_good, SQLITE3_TEXT);
                $notified_good = $stmt_check->execute()->fetchArray(SQLITE3_NUM)[0];
                
                if ($had_low_res > 0 && $notified_good == 0) {
                    // Отправляем уведомление о восстановлении разрешения
                    $message = "<b>Система:</b> <i>$system_name</i>\n";
                    $message .= "<blockquote><b>Устройство:</b> <i>{$row['name']}</i>\n";
                    $message .= "<b>Монитор:</b> ✅ разрешение в норме\n";
                    $message .= "<b>UUID:</b> <code>{$row['uuid']}</code></blockquote>";
                    
                    if (!empty($bot_token) && !empty($chat_id)) {
                        logMessage("Отправка уведомления о восстановлении разрешения для {$row['uuid']}");
                        if (sendTelegramMessage($bot_token, $chat_id, $message)) {
                            // Запоминаем, что отправили уведомление о хорошем разрешении
                            $stmt_insert = $db->prepare("
                                INSERT OR REPLACE INTO resolution_notifications (uuid, notification_key, sent_at) 
                                VALUES (:uuid, :key, :time)
                            ");
                            $stmt_insert->bindValue(':uuid', $row['uuid'], SQLITE3_TEXT);
                            $stmt_insert->bindValue(':key', $notification_key_good, SQLITE3_TEXT);
                            $stmt_insert->bindValue(':time', $current_time, SQLITE3_INTEGER);
                            $stmt_insert->execute();
                            
                            // Удаляем запись о низком разрешении
                            $stmt_delete = $db->prepare("DELETE FROM resolution_notifications WHERE notification_key = :key");
                            $stmt_delete->bindValue(':key', $notification_key_low, SQLITE3_TEXT);
                            $stmt_delete->execute();
                            
                            logMessage("Уведомление о восстановлении разрешения отправлено для {$row['uuid']}");
                        }
                    }
                } elseif ($notified_good == 0) {
                    // Если всегда было хорошее разрешение и еще не уведомляли
                    $stmt_insert = $db->prepare("
                        INSERT OR REPLACE INTO resolution_notifications (uuid, notification_key, sent_at) 
                        VALUES (:uuid, :key, :time)
                    ");
                    $stmt_insert->bindValue(':uuid', $row['uuid'], SQLITE3_TEXT);
                    $stmt_insert->bindValue(':key', $notification_key_good, SQLITE3_TEXT);
                    $stmt_insert->bindValue(':time', $current_time, SQLITE3_INTEGER);
                    $stmt_insert->execute();
                }
            }
        }
        
        // Очищаем старые уведомления (старше 24 часов)
        $cleanup_time = $current_time - (24 * 3600);
        $stmt_cleanup = $db->prepare("DELETE FROM resolution_notifications WHERE sent_at < :time");
        $stmt_cleanup->bindValue(':time', $cleanup_time, SQLITE3_INTEGER);
        $cleaned = $stmt_cleanup->execute();
        
        logMessage("Проверка разрешений завершена. Устройств с низким разрешением: $low_res_count, с хорошим: $good_res_count");
        
    } catch (Exception $e) {
        logMessage("Ошибка в checkResolutionAndNotify: " . $e->getMessage());
    }
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
        
        // Проверка разрешений и отправка уведомлений
        checkResolutionAndNotify($db, $bot_token, $chat_id, $system_name);

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
                $emoji = $is_online ? "🟢" : "🔴";
                $message = "<b>Система:</b> <i>$system_name</i>\n<blockquote><b>Имя:</b> <i>{$row['name']}</i>\n<b>Статус:</b> $emoji $status_text\n<b>UUID:</b> <code>$uuid</code></blockquote>";
                logMessage("Онлайн-статус изменён: $uuid → $status_text");
                if (!empty($bot_token) && !empty($chat_id)) {
                    sendTelegramMessage($bot_token, $chat_id, $message);
                }
            }

            // --- Проверка смены статуса воспроизведения ---
            if ($prev && $prev['playback'] != $playback) {
                $playback_text = $playback === 'playing' ? "восстановлено" : "зависло";
                $emoji = $playback === 'playing' ? "✅" : "🚨";
                $message = "<b>Система:</b> <i>$system_name</i>\n<blockquote><b>Имя:</b> <i>{$row['name']}</i>\n<b>Воспроизведение:</b> $emoji $playback_text\n<b>UUID:</b> <code>$uuid</code></blockquote>";
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