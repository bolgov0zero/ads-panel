// Форматирует секунды в MM:SS
function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function loadFiles() {
    try {
        const response = await fetch('api.php?action=list_files');
        const files = await response.json();
        const grid = document.getElementById('filesGrid');
        const noFilesMsg = document.getElementById('noFilesMessage');

        if (files.length === 0) {
            grid.innerHTML = '';
            noFilesMsg.classList.remove('hidden');
            return;
        } else {
            noFilesMsg.classList.add('hidden');
        }

        grid.innerHTML = ''; // Очищаем
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card bg-gray-800 rounded-xl shadow-lg p-4 relative overflow-hidden client-card';
            card.setAttribute('data-id', file.id);

            const isVideo = file.type === 'video';
            const thumbSrc = file.thumbnail || (isVideo ? '/assets/video-placeholder.jpg' : '/assets/pdf-placeholder.jpg');

            card.innerHTML = `
                <!-- Превью -->
                <div class="mb-3 h-40 bg-gray-700 rounded-lg overflow-hidden border border-gray-600">
                    <img src="${thumbSrc}" alt="${escapeHtml(file.name)}" 
                         class="w-full h-full object-cover cursor-pointer transition-transform hover:scale-105" 
                         onclick="window.open('${file.file_url}', '_blank')">
                </div>
            
                <!-- Имя файла -->
                <div class="text-center mb-2">
                    <span class="name-display block font-medium text-gray-200 truncate px-2" 
                          onclick="editFileName(this, ${file.id}, '${escapeHtml(file.name)}')">
                        ${escapeHtml(file.name)}
                    </span>
                    <input type="text" class="name-input hidden w-full p-1 bg-gray-700 border border-gray-600 rounded text-center text-gray-200" 
                           value="${escapeHtml(file.name)}" 
                           onblur="saveFileName(this, ${file.id})" 
                           onkeydown="if(event.key==='Enter') this.blur()">
                </div>
            
                <!-- Нижняя панель: рамка с иконкой и длительностью -->
                <div class="flex justify-between items-center px-1">
                    <!-- Рамка с иконкой и длительностью -->
                    <div class="flex items-center gap-1.5 px-2 py-1 bg-gray-700 rounded-md text-xs font-medium">
                        <i class="fas ${isVideo ? 'fa-video text-blue-400' : 'fa-file-pdf text-purple-400'}"></i>
                        ${isVideo && file.duration ? 
                            `<span class="text-gray-300">${formatDuration(file.duration)}</span>` : 
                            ''
                        }
                    </div>
            
                    <!-- Кнопка удаления -->
                    <button onclick="deleteFile(${file.id})" 
                            class="text-red-500 hover:text-red-400 transition text-sm p-1">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        filterFiles();
    } catch (err) {
        console.error('Ошибка загрузки файлов:', err);
        showNotification('Ошибка загрузки файлов', 'bg-red-500');
    }
}

// Безопасное экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Редактирование имени
function editFileName(span, id, currentName) {
    const input = span.nextElementSibling;
    span.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
}

// Сохранение имени
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

async function updateFileName(id, name) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_file_name', id, name })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            showNotification('Имя изменено');
            const row = document.querySelector(`#fileTable tr[data-id="${id}"]`);
            if (row) {
                row.querySelector('td:nth-child(2) input').value = name;
                filterFiles();
            }
            loadPlaylist();
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

// Удаление файла
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
            const card = document.querySelector(`.file-card[data-id="${id}"]`);
            if (card) card.remove();
            showNotification('Файл удалён');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка удаления', 'bg-red-500');
    }
}

// Фильтрация
function filterFiles() {
    const search = document.getElementById('fileSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.file-card');
    let visible = 0;

    cards.forEach(card => {
        const name = card.querySelector('.name-display').textContent.toLowerCase();
        if (name.includes(search)) {
            card.style.display = '';
            visible++;
        } else {
            card.style.display = 'none';
        }
    });

    const noFilesMsg = document.getElementById('noFilesMessage');
    if (visible === 0 && cards.length > 0) {
        noFilesMsg.classList.remove('hidden');
        noFilesMsg.innerHTML = '<p>Ничего не найдено по запросу.</p>';
    } else {
        noFilesMsg.classList.add('hidden');
    }
}

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