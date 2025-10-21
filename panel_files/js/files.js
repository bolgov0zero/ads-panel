async function loadFiles() {
    try {
        const response = await fetch('api.php?action=list_files');
        const files = await response.json();
        const tbody = document.getElementById('fileTable');
        const existingRows = Array.from(tbody.querySelectorAll('tr'));
        files.forEach(file => {
            const rowIndex = existingRows.findIndex(row => row.getAttribute('data-id') === String(file.id));
            let row;
            if (rowIndex !== -1) {
                row = existingRows[rowIndex];
                existingRows.splice(rowIndex, 1);
            } else {
                row = document.createElement('tr');
                row.setAttribute('data-id', file.id);
                tbody.appendChild(row);
            }
            row.innerHTML = `
                <td class="p-3"><center>${file.id}</center></td>
                <td class="p-3"><input type="text" value="${file.name}" class="p-1 bg-gray-700 border border-gray-600 rounded w-full" onchange="updateFileName(${file.id}, this.value)"></td>
                <td class="p-3"><center>${file.type === 'video' ? 'Видео' : 'PDF'}</center></td>
                <td class="p-3"><center>
                    <button class="text-red-500 hover:text-red-400" onclick="deleteFile(${file.id})"><i class="fas fa-trash"></i></button>
                </center></td>
            `;
        });
        existingRows.forEach(row => row.remove());
        filterFiles();
    } catch (err) {
        console.error('Ошибка загрузки файлов:', err);
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

async function deleteFile(id) {
    if (confirm('Удалить файл?')) {
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_file', id })
            });
            const result = await response.json();
            if (result.error) {
                console.error(result.error);
            } else {
                const fileRow = document.querySelector(`#fileTable tr[data-id="${id}"]`);
                if (fileRow) fileRow.remove();
                const playlistRow = document.querySelector(`#playlistTable tr[data-id="${id}"]`);
                if (playlistRow) playlistRow.remove();
            }
        } catch (err) {
            console.error('Ошибка:', err);
        }
    }
}

function filterFiles() {
    const search = document.getElementById('fileSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#fileTable tr');
    rows.forEach(row => {
        const name = row.querySelector('td:nth-child(2) input').value.toLowerCase();
        row.style.display = name.includes(search) ? '' : 'none';
    });
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
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification('Файл успешно загружен!');
            loadFiles();
        }
    } catch (err) {
        spinner.classList.add('hidden');
        console.error('Ошибка загрузки:', err);
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
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification(result.message);
            loadFiles();
        }
    } catch (err) {
        console.error('Ошибка сканирования файлов:', err);
        showNotification('Ошибка сканирования файлов', 'bg-red-500');
    }
});