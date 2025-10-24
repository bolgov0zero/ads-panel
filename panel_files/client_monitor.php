<?php

$db_path = '/data/ads.db';
$check_interval = 10; // Интервал проверки в секундах
$offline_threshold = 5; // Порог для оффлайн-статуса в секундах

try {
    $db = new SQLite3($db_path);
    $db->busyTimeout(5000);

    // Функция отправки сообщения в Telegram
    function sendTelegramMessage($botToken, $chatId, $message) {
        if (empty($botToken) || empty($chatId)) {
            error_log("Telegram settings are empty");
            return;
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
            error_log("Failed to send Telegram message: " . $response);
        }
    }

    // Загружаем настройки Telegram
    $stmt = $db->prepare("SELECT bot_token, chat_id FROM telegram_settings WHERE id = 1");
    $result = $stmt->execute();
    $telegram_settings = $result->fetchArray(SQLITE3_ASSOC);
    $bot_token = $telegram_settings['bot_token'] ?? '';
    $chat_id = $telegram_settings['chat_id'] ?? '';

    // Сохраняем предыдущие статусы устройств
    $previous_statuses = [];

    while (true) {
        // Получаем текущие статусы устройств
        $result = $db->query("SELECT uuid, name, COALESCE(last_seen, 0) AS last_seen FROM clients");
        $clients = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $row['last_seen'] = (int)$row['last_seen'];
            $row['status'] = (time() - $row['last_seen'] <= $offline_threshold) ? 'online' : 'offline';
            $clients[$row['uuid']] = $row;
        }

        // Сравниваем с предыдущими статусами
        foreach ($clients as $uuid => $client) {
            $previous_status = $previous_statuses[$uuid] ?? null;
            if ($previous_status !== $client['status']) {
                // Статус изменился
                if ($client['status'] === 'online') {
                    $message = "Устройство <b>{$client['name']}</b> (UUID: {$uuid}) вернулось в сеть.";
                } else {
                    $message = "Устройство <b>{$client['name']}</b> (UUID: {$uuid}) отключилось.";
                }
                sendTelegramMessage($bot_token, $chat_id, $message);
            }
        }

        // Обновляем предыдущие статусы
        $previous_statuses = [];
        foreach ($clients as $uuid => $client) {
            $previous_statuses[$uuid] = $client['status'];
        }

        // Ждём перед следующей проверкой
        sleep($check_interval);
    }
} catch (Exception $e) {
    error_log("Ошибка в client_monitor.php: " . $e->getMessage());
} finally {
    if (isset($db)) {
        $db->close();
    }
}
?>