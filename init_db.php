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
		CREATE TABLE IF NOT EXISTS videos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			video_url TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			order_num INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS clients (
			uuid TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT 'Без имени'
		);
		CREATE TABLE IF NOT EXISTS client_content (
			uuid TEXT NOT NULL,
			content_id INTEGER NOT NULL,
			content_type TEXT NOT NULL DEFAULT 'video',
			PRIMARY KEY (uuid, content_id, content_type)
		);
	");

	// Вставка тестового видео (опционально)
	if (file_exists('/opt/ads/default.mp4')) {
		$stmt = $db->prepare("INSERT OR IGNORE INTO videos (video_url, name, order_num) VALUES (:url, :name, :order)");
		$stmt->bindValue(':url', '/videos/default.mp4', SQLITE3_TEXT);
		$stmt->bindValue(':name', 'default.mp4', SQLITE3_TEXT);
		$stmt->bindValue(':order', 1, SQLITE3_INTEGER);
		$stmt->execute();
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