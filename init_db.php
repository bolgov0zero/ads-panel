<?php
header('Content-Type: text/html; charset=UTF-8');

// Путь к файлу базы данных
$db_path = '/data/ads.db';

try {
	// Проверяем, существует ли директория /data и доступна ли она для записи
	$data_dir = '/data';
	if (!is_dir($data_dir)) {
		throw new Exception("Директория $data_dir не существует");
	}
	if (!is_writable($data_dir)) {
		throw new Exception("Директория $data_dir не доступна для записи");
	}

	// Подключение к SQLite3
	$db = new SQLite3($db_path);

	// Устанавливаем таймаут для занятой базы данных
	$db->busyTimeout(5000);

	// Создание таблиц, если они не существуют
	$db->exec("
		CREATE TABLE IF NOT EXISTS files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_url TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			type TEXT NOT NULL DEFAULT 'video', -- 'video' или 'pdf'
			duration INTEGER, -- Продолжительность в секундах для PDF
			order_num INTEGER NOT NULL,
			is_default INTEGER DEFAULT 0 -- 1 для ads.pdf по умолчанию
		);
		CREATE TABLE IF NOT EXISTS clients (
			uuid TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT 'Без имени',
			show_info INTEGER DEFAULT 1 -- 1 для показа UUID и имени, 0 для скрытия
		);
		CREATE TABLE IF NOT EXISTS client_content (
			uuid TEXT NOT NULL,
			content_id INTEGER NOT NULL,
			content_type TEXT NOT NULL DEFAULT 'video',
			PRIMARY KEY (uuid, content_id, content_type)
		);
		CREATE TABLE IF NOT EXISTS message_settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			enabled INTEGER DEFAULT 0,
			text TEXT DEFAULT '',
			color TEXT DEFAULT '#ffffff',
			font_size INTEGER DEFAULT 24,
			speed INTEGER DEFAULT 100,
			bold INTEGER DEFAULT 0, -- 1 для жирного текста, 0 для обычного
			background_color TEXT DEFAULT '#000000' -- Цвет фона
		);
	");

	// Вставка ads.pdf по умолчанию
	if (file_exists('/var/www/html/ads.pdf')) {
		$stmt = $db->prepare("INSERT OR IGNORE INTO files (file_url, name, type, duration, order_num, is_default) VALUES (:url, :name, :type, :duration, :order, :is_default)");
		$stmt->bindValue(':url', '/ads.pdf', SQLITE3_TEXT);
		$stmt->bindValue(':name', 'ads.pdf', SQLITE3_TEXT);
		$stmt->bindValue(':type', 'pdf', SQLITE3_TEXT);
		$stmt->bindValue(':duration', 5, SQLITE3_INTEGER);
		$stmt->bindValue(':order', 0, SQLITE3_INTEGER);
		$stmt->bindValue(':is_default', 1, SQLITE3_INTEGER);
		$stmt->execute();
	}

	// Инициализация записи для настроек сообщения
	$result = $db->querySingle("SELECT COUNT(*) FROM message_settings");
	if ($result == 0) {
		$db->exec("INSERT INTO message_settings (id, enabled, text, color, font_size, speed, bold, background_color) VALUES (1, 0, '', '#ffffff', 24, 100, 0, '#000000')");
	}

	// Закрытие соединения
	$db->close();

	// Установка прав на файл базы данных
	chmod($db_path, 0664);

	echo 'База данных успешно инициализирована. <a href="admin.html">Перейти в админ-панель</a>';
} catch (Exception $e) {
	echo 'Ошибка инициализации базы данных: ' . $e->getMessage();
}
?>
