// Объект для хранения порядка для текущего устройства
let clientOrders = {};

async function loadPlaylist() {
    const uuid = document.getElementById('clientSelect').value;
    if (!uuid) {
        document.getElementById('playlistTable').innerHTML = '';
        clientOrders = {};
        return;
    }
    
    try {
        // Получаем файлы
        const response = await fetch('api.php?action=list_files');
        const files = await response.json();
        
        // Получаем контент для текущего устройства
        const contentResponse = await fetch(`api.php?action=list_client_content&uuid=${uuid}`);
        const content = await contentResponse.json();
        
        // Получаем порядок для текущего устройства
        const orderResponse = await fetch(`api.php?action=get_client_content_order&uuid=${uuid}`);
        clientOrders = await orderResponse.json();
        
        const tbody = document.getElementById('playlistTable');
        const existingRows = Array.from(tbody.querySelectorAll('tr'));
        
        // Фильтруем только несистемные файлы
        const nonSystemFiles = files.filter(file => file.is_default !== 1);
        
        nonSystemFiles.forEach(file => {
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
            const clientOrder = clientOrders[file.id] || 0;
            
            row.innerHTML = `
                <td class="p-3">${file.name}</td>
                <td class="p-3"><center>${file.type === 'video' ? 'Видео' : 'PDF'}</center></td>
                <td class="p-3"><center><label class="ios-switch"><input type="checkbox" ${isChecked ? 'checked' : ''} onchange="updateClientContent('${uuid}', ${file.id}, '${file.type}', this.checked)"><span class="slider"></span></label></center></td>
                <td class="p-3"><center>
                    <input type="number" value="${clientOrder}" class="w-16 p-1 bg-gray-700 border border-gray-600 rounded text-center" min="0" onchange="updateClientContentOrder('${uuid}', ${file.id}, this.value)" ${!isChecked ? 'disabled' : ''}>
                </center></td>
                <td class="p-3"><center>
                    ${file.type === 'pdf' ? 
                        `<input type="number" value="${file.duration || ''}" class="w-16 p-1 bg-gray-700 border border-gray-600 rounded text-center" onchange="updateFileDuration(${file.id}, this.value)" placeholder="5" min="1">` 
                        : '-'}
                </center></td>
            `;
            
            if (rowIndex === -1) {
                tbody.appendChild(row);
            }
        });
        
        // Удаляем старые строки
        existingRows.forEach(row => {
            if (!nonSystemFiles.some(file => String(file.id) === row.getAttribute('data-id'))) {
                row.remove();
            }
        });
        
    } catch (err) {
        console.error('Ошибка загрузки плейлиста:', err);
        showNotification('Ошибка загрузки плейлиста', 'bg-red-500');
    }
}

async function updateClientContent(uuid, content_id, content_type, enabled) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'update_client_content', 
                uuid, 
                content_id, 
                content_type, 
                enabled 
            })
        });
        
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            const row = document.querySelector(`#playlistTable tr[data-id="${content_id}"]`);
            if (row) {
                const checkbox = row.querySelector('td:nth-child(3) input');
                const orderInput = row.querySelector('td:nth-child(4) input');
                
                checkbox.checked = enabled;
                orderInput.disabled = !enabled;
                
                // Если отключаем контент, обнуляем порядок
                if (!enabled) {
                    orderInput.value = 0;
                    if (clientOrders[content_id]) {
                        delete clientOrders[content_id];
                    }
                } else {
                    // Если включаем, устанавливаем следующий доступный порядок
                    const maxOrder = Math.max(0, ...Object.values(clientOrders));
                    orderInput.value = maxOrder + 1;
                    updateClientContentOrder(uuid, content_id, maxOrder + 1);
                }
            }
            showNotification(enabled ? 'Контент добавлен в плейлист' : 'Контент удалён из плейлиста');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка обновления контента', 'bg-red-500');
    }
}

async function updateClientContentOrder(uuid, content_id, order) {
    if (!uuid || content_id <= 0) return;
    
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'update_client_content_order', 
                uuid, 
                content_id, 
                order: parseInt(order) || 0 
            })
        });
        
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            clientOrders[content_id] = parseInt(order) || 0;
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка обновления порядка', 'bg-red-500');
    }
}

async function updateFileDuration(id, duration) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'update_file_duration', 
                id, 
                duration: parseInt(duration) || null 
            })
        });
        
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification('Продолжительность обновлена');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка обновления продолжительности', 'bg-red-500');
    }
}

// Функция для загрузки списка клиентов в select
async function loadClients() {
    try {
        const response = await fetch('api.php?action=list_clients');
        const clients = await response.json();
        const select = document.getElementById('clientSelect');
        
        select.innerHTML = '<option value="">-- Выберите устройство --</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.uuid;
            option.textContent = `${client.name} (${client.status === 'online' ? '🟢 онлайн' : '⚫ офлайн'})`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Ошибка загрузки клиентов:', err);
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    loadClients();
});