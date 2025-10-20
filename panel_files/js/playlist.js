async function loadPlaylist() {
    const uuid = document.getElementById('clientSelect').value;
    if (!uuid) {
        document.getElementById('playlistTable').innerHTML = '';
        return;
    }
    try {
        const response = await fetch('api.php?action=list_files');
        const files = await response.json();
        const contentResponse = await fetch(`api.php?action=list_client_content&uuid=${uuid}`);
        const content = await contentResponse.json();
        const tbody = document.getElementById('playlistTable');
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
            const isChecked = content.some(c => c.id === file.id && c.type === file.type);
            row.innerHTML = `
                <td class="p-3">${file.id}</td>
                <td class="p-3">${file.name}</td>
                <td class="p-3"><center>${file.type === 'video' ? 'Видео' : 'PDF'}</center></td>
                <td class="p-3"><center><label class="ios-switch"><input type="checkbox" ${isChecked ? 'checked' : ''} onchange="updateClientContent('${uuid}', ${file.id}, '${file.type}', this.checked)"><span class="slider"></span></label></center></td>
                <td class="p-3"><center>
                    <input type="number" value="${file.order_num}" class="w-20 p-1 bg-gray-700 border border-gray-600 rounded" onchange="updateOrder('file', ${file.id}, this.value)">
                </center></td>
                <td class="p-3"><center>
                    ${file.type === 'pdf' ? 
                        `<input type="number" value="${file.duration || ''}" class="w-20 p-1 bg-gray-700 border border-gray-600 rounded" onchange="updateFileDuration(${file.id}, this.value)" placeholder="5" min="1">` 
                        : '-'}
                </center></td>
            `;
            if (rowIndex === -1) {
                tbody.appendChild(row);
            }
        });
        existingRows.forEach(row => {
            if (!files.some(file => String(file.id) === row.getAttribute('data-id'))) {
                row.remove();
            }
        });
    } catch (err) {
        console.error('Ошибка загрузки плейлиста:', err);
    }
}

async function updateFileDuration(id, duration) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_file_duration', id, duration: parseInt(duration) || null })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            const row = document.querySelector(`#playlistTable tr[data-id="${id}"]`);
            if (row && row.querySelector('td:nth-child(6) input')) {
                row.querySelector('td:nth-child(6) input').value = duration || '';
            }
            loadFiles();
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

async function updateOrder(type, id, order) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: `update_${type}_order`, id, order })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            const row = document.querySelector(`#playlistTable tr[data-id="${id}"]`);
            if (row) {
                row.querySelector('td:nth-child(5) input').value = order;
            }
            loadFiles();
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

async function updateClientContent(uuid, content_id, content_type, enabled) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_content', uuid, content_id, content_type, enabled })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            const row = document.querySelector(`#playlistTable tr[data-id="${content_id}"]`);
            if (row) {
                row.querySelector('td:nth-child(4) input').checked = enabled;
            }
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}