// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Безопасное экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Форматирует секунды в MM:SS
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// === РЕДАКТИРОВАНИЕ ИМЕНИ ===
function editFileName(span, id, currentName) {
    const input = span.nextElementSibling;
    span.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
}

async function saveFileName(input, id) {
    const newName = input.value.trim();
    const span = input.previousElementSibling;

    if (newName === '' || newName === span.textContent) {
        input.classList.add('hidden');
        span.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_file_name', id, name: newName })
        });
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'bg-red-500');
            input.value = span.textContent;
        } else {
            span.textContent = newName;
            showNotification('Имя изменено');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка сохранения', 'bg-red-500');
        input.value = span.textContent;
    } finally {
        input.classList.add('hidden');
        span.classList.remove('hidden');
        filterFiles();
    }
}

// === УДАЛЕНИЕ ФАЙЛА ===
async function deleteFile(id) {
    if (!confirm('Удалить файл?')) return;

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_file', id })
        });
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'bg-red-500');
        } else {
            const card = document.querySelector(`.file-row[data-id="${id}"]`);
            if (card) card.remove();
            showNotification('Файл удалён');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка удаления', 'bg-red-500');
    }
}

// === ФИЛЬТРАЦИЯ ===
function filterFiles() {
    const search = document.getElementById('fileSearch').value.toLowerCase();
    const rows = document.querySelectorAll('.file-row');
    let visible = 0;

    rows.forEach(row => {
        const name = row.querySelector('.name-display').textContent.toLowerCase();
        if (name.includes(search)) {
            row.style.display = '';
            visible++;
        } else {
            row.style.display = 'none';
        }
    });

    const noFilesMsg = document.getElementById('noFilesMessage');
    if (visible === 0 && rows.length > 0) {
        noFilesMsg.classList.remove('hidden');
        noFilesMsg.innerHTML = '<p>Ничего не найдено по запросу.</p>';
    } else {
        noFilesMsg.classList.add('hidden');
    }
}

// === ЗАГРУЗКА ФАЙЛОВ ===
async function loadFiles() {
    try {
        const response = await fetch('api.php?action=list_files');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const files = await response.json();
        const container = document.getElementById('filesGrid');
        const noFilesMsg = document.getElementById('noFilesMessage');

        if (!Array.isArray(files) || files.length === 0) {
            container.innerHTML = '';
            noFilesMsg.classList.remove('hidden');
            return;
        } else {
            noFilesMsg.classList.add('hidden');
        }

        // Создаем таблицу
        container.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div class="grid grid-cols-12 gap-4 p-4 bg-gray-700 text-gray-200 font-medium border-b border-gray-600">
                    <div class="col-span-1 text-center">ID</div>
                    <div class="col-span-2">Превью</div>
                    <div class="col-span-3">Имя файла</div>
                    <div class="col-span-1 text-center">Тип</div>
                    <div class="col-span-1 text-center">Длительность</div>
                    <div class="col-span-3 text-center">Действия</div>
                    <div class="col-span-1 text-center">Удалить</div>
                </div>
                <div id="filesList"></div>
            </div>
        `;

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';

        files.forEach(file => {
            const duration = file.duration && !isNaN(file.duration) ? parseInt(file.duration) : null;
            const isVideo = file.type === 'video';
            const thumbSrc = file.thumbnail || 
                (isVideo ? '/assets/video-placeholder.jpg' : '/assets/pdf-placeholder.jpg');

            const row = document.createElement('div');
            row.className = 'file-row grid grid-cols-12 gap-4 p-4 items-center border-b border-gray-700 hover:bg-gray-750 transition-colors';
            row.setAttribute('data-id', file.id);

            row.innerHTML = `
                <!-- ID -->
                <div class="col-span-1 text-center text-gray-300 font-mono">
                    ${file.id}
                </div>

                <!-- Превью -->
                <div class="col-span-2">
                    <div class="h-20 bg-gray-700 rounded-lg overflow-hidden border border-gray-600">
                        <img src="${thumbSrc}" alt="${escapeHtml(file.name)}" 
                             class="w-full h-full object-cover cursor-pointer transition-transform hover:scale-105" 
                             onclick="window.open('${file.file_url}', '_blank')">
                    </div>
                </div>

                <!-- Имя файла -->
                <div class="col-span-3">
                    <div class="flex flex-col">
                        <span class="name-display font-medium text-gray-200 truncate mb-1 cursor-pointer hover:text-blue-300 transition-colors"
                              onclick="editFileName(this, ${file.id}, '${escapeHtml(file.name)}')">
                            ${escapeHtml(file.name)}
                        </span>
                        <input type="text" class="name-input hidden w-full p-1 bg-gray-600 border border-gray-500 rounded text-sm text-gray-200" 
                               value="${escapeHtml(file.name)}" 
                               onblur="saveFileName(this, ${file.id})" 
                               onkeydown="if(event.key==='Enter') this.blur()">
                        <div class="text-xs text-gray-400 truncate">
                            ${file.file_url}
                        </div>
                    </div>
                </div>

                <!-- Тип -->
                <div class="col-span-1 text-center">
                    <div class="inline-flex items-center justify-center gap-1 px-2 py-1 bg-gray-700 rounded-md text-xs font-medium">
                        <i class="fas ${isVideo ? 'fa-video text-blue-400' : 'fa-file-pdf text-purple-400'}"></i>
                        <span class="text-gray-300">${isVideo ? 'Видео' : 'PDF'}</span>
                    </div>
                </div>

                <!-- Длительность -->
                <div class="col-span-1 text-center">
                    <div class="text-gray-300 font-mono text-sm">
                        ${formatDuration(duration) || '-'}
                    </div>
                </div>

                <!-- Действия -->
                <div class="col-span-3 text-center">
                    <div class="flex flex-col gap-2">
                        <button onclick="window.open('${file.file_url}', '_blank')" 
                                class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors">
                            <i class="fas fa-external-link-alt mr-1"></i> Открыть
                        </button>
                        <button onclick="copyToClipboard('${file.file_url}')" 
                                class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors">
                            <i class="fas fa-copy mr-1"></i> Копировать ссылку
                        </button>
                    </div>
                </div>

                <!-- Удалить -->
                <div class="col-span-1 text-center">
                    <button onclick="deleteFile(${file.id})" 
                            class="text-red-500 hover:text-red-400 transition text-lg p-2 hover:bg-red-500 hover:bg-opacity-10 rounded">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            filesList.appendChild(row);
        });

        filterFiles();
    } catch (err) {
        console.error('Ошибка загрузки файлов:', err);
        showNotification('Ошибка загрузки файлов', 'bg-red-500');
    }
}

// === КОПИРОВАНИЕ ССЫЛКИ В БУФЕР ===
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Ссылка скопирована в буфер', 'bg-green-500');
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Не удалось скопировать ссылку', 'bg-red-500');
    });
}

// === ЗАГРУЗКА ФАЙЛА ===
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const spinner = document.getElementById('uploadSpinner');
    spinner.classList.remove('hidden');
    const formData = new FormData(e.target);
    formData.append('action', 'upload_file');
    
    try {
        const response = await fetch('api.php', { method: 'POST', body: formData });
        const result = await response.json();
        spinner.classList.add('hidden');
        
        if (result.error) {
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification('Файл успешно загружен!');
            e.target.reset();
            loadFiles();
        }
    } catch (err) {
        spinner.classList.add('hidden');
        showNotification('Ошибка загрузки файла', 'bg-red-500');
    }
});

// === СКАНИРОВАНИЕ ФАЙЛОВ ===
document.getElementById('scanFilesBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan_files' })
        });
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification(result.message || 'Сканирование завершено');
            loadFiles();
        }
    } catch (err) {
        showNotification('Ошибка сканирования', 'bg-red-500');
    }
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    document.getElementById('fileSearch').addEventListener('input', filterFiles);
});