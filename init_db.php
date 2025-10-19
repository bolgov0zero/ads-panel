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
    $db->busyTimeout(5000);

    // Функция для проверки существования таблицы
    function tableExists($db, $tableName) {
        $result = $db->querySingle("SELECT name FROM sqlite_master WHERE type='table' AND name='$tableName'");
        return $result !== null;
    }

    // Функция для проверки существования столбца в таблице
    function columnExists($db, $tableName, $columnName) {
        $result = $db->query("PRAGMA table_info($tableName)");
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            if ($row['name'] === $columnName) {
                return true;
            }
        }
        return false;
    }

    // Определение структуры таблиц
    $tables = [
        'files' => [
            'create' => "
                CREATE TABLE files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_url TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    type TEXT NOT NULL DEFAULT 'video',
                    duration INTEGER,
                    order_num INTEGER NOT NULL,
                    is_default INTEGER DEFAULT 0
                )",
            'columns' => [
                ['name' => 'file_url', 'type' => 'TEXT', 'constraints' => 'NOT NULL'],
                ['name' => 'name', 'type' => 'TEXT', 'constraints' => 'NOT NULL DEFAULT \'\''],
                ['name' => 'type', 'type' => 'TEXT', 'constraints' => 'NOT NULL DEFAULT \'video\''],
                ['name' => 'duration', 'type' => 'INTEGER'],
                ['name' => 'order_num', 'type' => 'INTEGER', 'constraints' => 'NOT NULL'],
                ['name' => 'is_default', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 0'],
            ],
            'initial_data' => function ($db) {
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
            }
        ],
        'clients' => [
            'create' => "
                CREATE TABLE clients (
                    uuid TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT 'Без имени',
                    show_info INTEGER DEFAULT 1,
                    last_seen INTEGER
                )",
            'columns' => [
                ['name' => 'uuid', 'type' => 'TEXT', 'constraints' => 'PRIMARY KEY'],
                ['name' => 'name', 'type' => 'TEXT', 'constraints' => 'NOT NULL DEFAULT \'Без имени\''],
                ['name' => 'show_info', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 1'],
                ['name' => 'last_seen', 'type' => 'INTEGER'],
            ],
            'initial_data' => null
        ],
        'client_content' => [
            'create' => "
                CREATE TABLE client_content (
                    uuid TEXT NOT NULL,
                    content_id INTEGER NOT NULL,
                    content_type TEXT NOT NULL DEFAULT 'video',
                    PRIMARY KEY (uuid, content_id, content_type)
                )",
            'columns' => [
                ['name' => 'uuid', 'type' => 'TEXT', 'constraints' => 'NOT NULL'],
                ['name' => 'content_id', 'type' => 'INTEGER', 'constraints' => 'NOT NULL'],
                ['name' => 'content_type', 'type' => 'TEXT', 'constraints' => 'NOT NULL DEFAULT \'video\''],
            ],
            'initial_data' => null
        ],
        'message_settings' => [
            'create' => "
                CREATE TABLE message_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 0,
                    text TEXT DEFAULT '',
                    color TEXT DEFAULT '#ffffff',
                    font_size INTEGER DEFAULT 24,
                    speed INTEGER DEFAULT 100,
                    bold INTEGER DEFAULT 0,
                    background_color TEXT DEFAULT '#000000'
                )",
            'columns' => [
                ['name' => 'id', 'type' => 'INTEGER', 'constraints' => 'PRIMARY KEY CHECK (id = 1)'],
                ['name' => 'enabled', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 0'],
                ['name' => 'text', 'type' => 'TEXT', 'constraints' => 'DEFAULT \'\''],
                ['name' => 'color', 'type' => 'TEXT', 'constraints' => 'DEFAULT \'#ffffff\''],
                ['name' => 'font_size', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 24'],
                ['name' => 'speed', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 100'],
                ['name' => 'bold', 'type' => 'INTEGER', 'constraints' => 'DEFAULT 0'],
                ['name' => 'background_color', 'type' => 'TEXT', 'constraints' => 'DEFAULT \'#000000\''],
            ],
            'initial_data' => function ($db) {
                $result = $db->querySingle("SELECT COUNT(*) FROM message_settings");
                if ($result == 0) {
                    $db->exec("INSERT INTO message_settings (id, enabled, text, color, font_size, speed, bold, background_color) VALUES (1, 0, '', '#ffffff', 24, 100, 0, '#000000')");
                }
            }
        ]
    ];

    // Создание или обновление таблиц
    foreach ($tables as $tableName => $tableDef) {
        // Создаём таблицу, если она не существует
        if (!tableExists($db, $tableName)) {
            $db->exec($tableDef['create']);
            echo "Таблица $tableName создана.<br>";
        }

        // Проверяем и добавляем новые столбцы
        foreach ($tableDef['columns'] as $column) {
            if (!columnExists($db, $tableName, $column['name'])) {
                $constraints = isset($column['constraints']) ? $column['constraints'] : '';
                $db->exec("ALTER TABLE $tableName ADD COLUMN {$column['name']} {$column['type']} $constraints");
                echo "Столбец {$column['name']} добавлен в таблицу $tableName.<br>";
            }
        }

        // Выполняем вставку начальных данных, если она определена
        if (isset($tableDef['initial_data']) && is_callable($tableDef['initial_data'])) {
            $tableDef['initial_data']($db);
        }
    }

    // Установка прав на файл базы данных
    chmod($db_path, 0664);

    echo 'База данных успешно инициализирована. <a href="admin.html">Перейти в админ-панель</a>';
} catch (Exception $e) {
    echo 'Ошибка инициализации базы данных: ' . $e->getMessage();
} finally {
    if (isset($db)) {
        $db->close();
    }
}
?>