<?php
header('Content-Type: application/json');

try {
	// Подключение к SQLite3
	$db = new SQLite3('/data/ads.db');
	$db->busyTimeout(5000); // Устанавливаем таймаут для занятой базы данных

	// Обработка запросов
	$input = json_decode(file_get_contents('php://input'), true);
	$action = $_POST['action'] ?? $_GET['action'] ?? $input['action'] ?? '';

	switch ($action) {
		case 'upload_video':
			$uploadDir = '/opt/ads/';
			if (!is_dir($uploadDir)) {
				mkdir($uploadDir, 0755, true);
			}
			if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
				$errors = [
					UPLOAD_ERR_INI_SIZE => 'Файл превышает upload_max_filesize',
					UPLOAD_ERR_FORM_SIZE => 'Файл превышает MAX_FILE_SIZE',
					UPLOAD_ERR_PARTIAL => 'Файл загружен частично',
					UPLOAD_ERR_NO_FILE => 'Файл не загружен',
					UPLOAD_ERR_NO_TMP_DIR => 'Отсутствует временная папка',
					UPLOAD_ERR_CANT_WRITE => 'Ошибка записи файла',
					UPLOAD_ERR_EXTENSION => 'Загрузка прервана расширением'
				];
				$error = $_FILES['video']['error'] ?? UPLOAD_ERR_NO_FILE;
				echo json_encode(['error' => $errors[$error] ?? 'Неизвестная ошибка загрузки']);
				break;
			}
			$videoFile = $uploadDir . basename($_FILES['video']['name']);
			$videoUrl = '/videos/' . basename($_FILES['video']['name']);
			$name = basename($_FILES['video']['name']);
			$extension = strtolower(pathinfo($_FILES['video']['name'], PATHINFO_EXTENSION));
			if ($extension !== 'mp4') {
				echo json_encode(['error' => 'Файл должен быть в формате MP4']);
				break;
			}
			if (move_uploaded_file($_FILES['video']['tmp_name'], $videoFile)) {
				$stmt = $db->prepare("INSERT INTO videos (video_url, name, order_num) SELECT :url, :name, COALESCE(MAX(order_num) + 1, 1) FROM videos");
				$stmt->bindValue(':url', $videoUrl, SQLITE3_TEXT);
				$stmt->bindValue(':name', $name, SQLITE3_TEXT);
				$stmt->execute();
				echo json_encode(['message' => 'Видео загружено']);
			} else {
				echo json_encode(['error' => 'Не удалось переместить файл']);
			}
			break;

		case 'scan_videos':
			$uploadDir = '/opt/ads/';
			if (!is_dir($uploadDir)) {
				echo json_encode(['error' => 'Папка /opt/ads/ не существует']);
				break;
			}
			$files = scandir($uploadDir);
			$newVideos = 0;
			foreach ($files as $file) {
				if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'mp4') {
					$videoFile = $uploadDir . $file;
					$videoUrl = '/videos/' . $file;
					$name = $file;
					$stmt = $db->prepare("SELECT COUNT(*) FROM videos WHERE video_url = :url");
					$stmt->bindValue(':url', $videoUrl, SQLITE3_TEXT);
					$result = $stmt->execute()->fetchArray(SQLITE3_NUM)[0];
					if ($result === 0) {
						$stmt = $db->prepare("INSERT INTO videos (video_url, name, order_num) SELECT :url, :name, COALESCE(MAX(order_num) + 1, 1) FROM videos");
						$stmt->bindValue(':url', $videoUrl, SQLITE3_TEXT);
						$stmt->bindValue(':name', $name, SQLITE3_TEXT);
						$stmt->execute();
						$newVideos++;
					}
				}
			}
			echo json_encode(['message' => "Добавлено новых видео: $newVideos"]);
			break;

		case 'add_client':
			$uuid = $input['uuid'] ?? '';
			$name = $input['name'] ?? 'Без имени';
			if (empty($uuid)) {
				echo json_encode(['error' => 'UUID не указан']);
				break;
			}
			$stmt = $db->prepare("INSERT OR REPLACE INTO clients (uuid, name) VALUES (:uuid, :name)");
			$stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
			$stmt->bindValue(':name', $name, SQLITE3_TEXT);
			$stmt->execute();
			echo json_encode(['message' => 'Клиент создан']);
			break;

		case 'get_client_info':
			$uuid = $_GET['uuid'] ?? '';
			if (empty($uuid)) {
				echo json_encode(['error' => 'UUID не указан']);
				break;
			}
			$stmt = $db->prepare("SELECT uuid, name FROM clients WHERE uuid = :uuid");
			$stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
			$result = $stmt->execute();
			if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
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

		case 'update_video_name':
			$id = $input['id'] ?? 0;
			$name = $input['name'] ?? '';
			if ($id <= 0 || empty($name)) {
				echo json_encode(['error' => 'Неверный ID или имя']);
				break;
			}
			$stmt = $db->prepare("UPDATE videos SET name = :name WHERE id = :id");
			$stmt->bindValue(':name', $name, SQLITE3_TEXT);
			$stmt->bindValue(':id', $id, SQLITE3_INTEGER);
			$stmt->execute();
			echo json_encode(['message' => 'Имя видео обновлено']);
			break;

		case 'list_videos':
			$result = $db->query("SELECT id, video_url, name, order_num FROM videos ORDER BY order_num ASC");
			$videos = [];
			while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
				$videos[] = $row;
			}
			echo json_encode($videos);
			break;

		case 'list_clients':
			$result = $db->query("SELECT uuid, name FROM clients");
			$clients = [];
			while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
				$stmt = $db->prepare("SELECT content_id, content_type FROM client_content WHERE uuid = :uuid");
				$stmt->bindValue(':uuid', $row['uuid'], SQLITE3_TEXT);
				$contentResult = $stmt->execute();
				$content = [];
				while ($c = $contentResult->fetchArray(SQLITE3_ASSOC)) {
					$content[] = ['id' => $c['content_id'], 'type' => $c['content_type']];
				}
				$clients[] = ['uuid' => $row['uuid'], 'name' => $row['name'], 'content' => $content];
			}
			echo json_encode($clients);
			break;

		case 'count_clients':
			$result = $db->querySingle("SELECT COUNT(*) FROM clients");
			echo json_encode(['count' => $result]);
			break;

		case 'list_client_content':
			$uuid = $_GET['uuid'] ?? '';
			if (empty($uuid)) {
				echo json_encode(['error' => 'UUID не указан']);
				break;
			}
			$stmt = $db->prepare("
				SELECT v.id, v.video_url, v.name, v.order_num, 'video' as type
				FROM videos v
				JOIN client_content cc ON v.id = cc.content_id AND cc.content_type = 'video'
				WHERE cc.uuid = :uuid
				ORDER BY order_num ASC
			");
			$stmt->bindValue(':uuid', $uuid, SQLITE3_TEXT);
			$result = $stmt->execute();
			$content = [];
			while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
				$content[] = $row;
			}
			echo json_encode($content);
			break;

		case 'update_video_order':
			$id = $input['id'] ?? 0;
			$order = $input['order'] ?? 0;
			if ($id <= 0 || $order < 0) {
				echo json_encode(['error' => 'Неверный ID или порядок']);
				break;
			}
			$stmt = $db->prepare("UPDATE videos SET order_num = :order WHERE id = :id");
			$stmt->bindValue(':order', $order, SQLITE3_INTEGER);
			$stmt->bindValue(':id', $id, SQLITE3_INTEGER);
			$stmt->execute();
			echo json_encode(['message' => 'Порядок видео обновлён']);
			break;

		case 'delete_video':
			$id = $input['id'] ?? 0;
			if ($id <= 0) {
				echo json_encode(['error' => 'Неверный ID видео']);
				break;
			}
			$result = $db->query("SELECT video_url FROM videos WHERE id = $id");
			if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
				$filePath = str_replace('/videos/', '/opt/ads/', $row['video_url']);
				if (file_exists($filePath)) {
					unlink($filePath);
				}
				$db->exec("DELETE FROM videos WHERE id = $id");
				$db->exec("DELETE FROM client_content WHERE content_id = $id AND content_type = 'video'");
				echo json_encode(['message' => 'Видео удалено']);
			} else {
				echo json_encode(['error' => 'Видео не найдено']);
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