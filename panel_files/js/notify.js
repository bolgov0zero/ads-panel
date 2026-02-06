async function loadTelegramSettings() {
    try {
        const response = await fetch('api.php?action=get_telegram_settings');
        const settings = await response.json();
        console.log('Загружены настройки Telegram:', settings);
        document.getElementById('telegramBotToken').value = settings.bot_token || '';
        document.getElementById('telegramChatId').value = settings.chat_id || '';
    } catch (err) {
        console.error('Ошибка загрузки настроек Telegram:', err);
        showNotification('Ошибка загрузки настроек Telegram', 'bg-red-500');
    }
}

async function saveTelegramSettings() {
    const botToken = document.getElementById('telegramBotToken').value.trim();
    const chatId = document.getElementById('telegramChatId').value.trim();

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_telegram_settings',
                bot_token: botToken,
                chat_id: chatId
            })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification('Ошибка сохранения настроек Telegram', 'bg-red-500');
        } else {
            showNotification('Настройки Telegram сохранены');
        }
    } catch (err) {
        console.error('Ошибка сохранения настроек Telegram:', err);
        showNotification('Ошибка сохранения настроек Telegram', 'bg-red-500');
    }
}

async function sendTestTelegramMessage() {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'send_test_telegram_message' })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification('Тестовое сообщение отправлено');
        }
    } catch (err) {
        console.error('Ошибка отправки тестового сообщения:', err);
        showNotification('Ошибка отправки тестового сообщения', 'bg-red-500');
    }
}

async function forceResolutionCheck() {
    try {
        const button = event.target;
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Проверка...';
        button.disabled = true;
        
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'force_resolution_check' })
        });
        const result = await response.json();
        
        button.innerHTML = originalText;
        button.disabled = false;
        
        if (result.error) {
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            if (result.stats) {
                const stats = result.stats;
                const total = stats.low + stats.good + stats.unknown;
                showNotification(`Отчет отправлен. Низкое: ${stats.low}, Хорошее: ${stats.good}, Неизвестно: ${stats.unknown}`, 'bg-green-500');
            } else {
                showNotification(result.message);
            }
        }
    } catch (err) {
        console.error('Ошибка проверки разрешений:', err);
        showNotification('Ошибка проверки разрешений', 'bg-red-500');
        // Восстанавливаем кнопку в случае ошибки
        const button = event.target;
        button.innerHTML = '<i class="fas fa-desktop mr-2"></i>Проверить разрешения';
        button.disabled = false;
    }
}