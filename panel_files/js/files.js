// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Безопасное экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Форматирует секунды в MM:SS
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '-';
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

        // Создаем контейнер для файлов
        container.innerHTML = `
            <!-- Заголовок -->
            <div class="files-header bg-gray-800 rounded-t-lg border-b border-gray-700 p-3">
                <div class="grid grid-cols-12 gap-3 text-gray-300 text-xs font-medium">
                    <div class="col-span-4">Имя файла</div>
                    <div class="col-span-2">Превью</div>
                    <div class="col-span-2 text-center">Тип</div>
                    <div class="col-span-2 text-center">Длительность</div>
                    <div class="col-span-2 text-center">Действия</div>
                </div>
            </div>
            
            <!-- Список файлов -->
            <div id="filesList" class="files-list rounded-b-lg"></div>
        `;

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';

        files.forEach(file => {
            const duration = file.duration && !isNaN(file.duration) ? parseInt(file.duration) : null;
            const isVideo = file.type === 'video';
            const thumbSrc = file.thumbnail || 
                (isVideo ? '/assets/video-placeholder.jpg' : '/assets/pdf-placeholder.jpg');

            const row = document.createElement('div');
            row.className = 'file-row bg-gray-800 border-b border-gray-700 last:border-b-0 hover:bg-gray-750 transition-colors';
            row.setAttribute('data-id', file.id);

            row.innerHTML = `
                <!-- Строка файла -->
                <div class="grid grid-cols-12 gap-3 p-3 items-center">
                    <!-- Имя файла -->
                    <div class="col-span-4">
                        <div class="flex flex-col">
                            <span class="name-display font-medium text-gray-200 truncate cursor-pointer hover:text-blue-300 transition-colors text-sm"
                                  onclick="editFileName(this, ${file.id}, '${escapeHtml(file.name)}')"
                                  title="${escapeHtml(file.name)}">
                                ${escapeHtml(file.name)}
                            </span>
                            <input type="text" class="name-input hidden w-full p-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 mt-1" 
                                   value="${escapeHtml(file.name)}" 
                                   onblur="saveFileName(this, ${file.id})" 
                                   onkeydown="if(event.key==='Enter') this.blur()">
                            <div class="text-xs text-gray-500 truncate mt-0.5">
                                ${file.file_url}
                            </div>
                        </div>
                    </div>

                    <!-- Превью -->
                    <div class="col-span-2">
                        <div class="h-16 bg-gray-700 rounded overflow-hidden border border-gray-600">
                            <img src="${thumbSrc}" alt="${escapeHtml(file.name)}" 
                                 class="w-full h-full object-cover cursor-pointer transition-transform hover:scale-105" 
                                 onclick="window.open('${file.file_url}', '_blank')"
                                 title="Открыть файл">
                        </div>
                    </div>

                    <!-- Тип -->
                    <div class="col-span-2 text-center">
                        <div class="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-gray-700 rounded-lg border border-gray-600">
                            <i class="fas ${isVideo ? 'fa-video text-blue-400' : 'fa-file-pdf text-purple-400'} text-xs"></i>
                            <span class="text-gray-300 text-xs">${isVideo ? 'Видео' : 'PDF'}</span>
                        </div>
                    </div>

                    <!-- Длительность -->
                    <div class="col-span-2 text-center">
                        <div class="text-gray-300 font-mono text-sm bg-gray-700 rounded-lg py-1 border border-gray-600">
                            ${formatDuration(duration)}
                        </div>
                    </div>

                    <!-- Действия -->
                    <div class="col-span-2 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="window.open('${file.file_url}', '_blank')" 
                                    class="text-blue-400 hover:text-blue-300 p-1.5 hover:bg-blue-500 hover:bg-opacity-10 rounded transition-colors"
                                    title="Открыть файл">
                                <i class="fas fa-external-link-alt text-xs"></i>
                            </button>
                            <button onclick="deleteFile(${file.id})" 
                                    class="text-red-500 hover:text-red-400 p-1.5 hover:bg-red-500 hover:bg-opacity-10 rounded transition-colors"
                                    title="Удалить файл">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>
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