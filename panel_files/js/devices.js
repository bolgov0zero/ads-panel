async function loadClients() {
    try {
        const response = await fetch('api.php?action=list_clients');
        const clients = await response.json();
        console.log('Клиенты:', clients);
        const tbody = document.getElementById('clientTable');
        const clientSelect = document.getElementById('clientSelect');
        const existingRows = Array.from(tbody.querySelectorAll('tr'));
        const existingOptions = Array.from(clientSelect.querySelectorAll('option:not(:first-child)'));
        clients.forEach(client => {
            console.log(`Клиент ${client.uuid}: last_seen = ${client.last_seen}`);
            const rowIndex = existingRows.findIndex(row => row.getAttribute('data-uuid') === client.uuid);
            let row;
            if (rowIndex !== -1) {
                row = existingRows[rowIndex];
                existingRows.splice(rowIndex, 1);
            } else {
                row = document.createElement('tr');
                row.setAttribute('data-uuid', client.uuid);
                tbody.appendChild(row);
            }
            row.innerHTML = `
                <td class="p-3"><center>
                    <div class="status-dot ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
                    <span class="status-text">${formatLastSeen(client.last_seen)}</span>
                </center></td>
                <td class="p-3"><center>${client.uuid}</center></td>
                <td class="p-3">
                    <input type="text" value="${client.name}" class="p-1 bg-gray-700 border border-gray-600 rounded w-full" onchange="updateClientName('${client.uuid}', this.value)">
                </td>
                <td class="p-3"><center><label class="ios-switch"><input type="checkbox" ${client.show_info ? 'checked' : ''} onchange="updateClientShowInfo('${client.uuid}', this.checked)"><span class="slider"></span></label></center></td>
                <td class="p-3"><center>
                    <button class="text-red-500 hover:text-red-400" onclick="deleteClient('${client.uuid}')"><i class="fas fa-trash"></i></button>
                </center></td>
            `;
            const optionIndex = existingOptions.findIndex(opt => opt.value === client.uuid);
            let option;
            if (optionIndex !== -1) {
                option = existingOptions[optionIndex];
                existingOptions.splice(optionIndex, 1);
            } else {
                option = document.createElement('option');
                option.value = client.uuid;
                clientSelect.appendChild(option);
            }
            option.textContent = client.name;
        });
        existingRows.forEach(row => row.remove());
        existingOptions.forEach(opt => opt.remove());
    } catch (err) {
        console.error('Ошибка загрузки клиентов:', err);
    }
}

async function updateClientStatuses() {
    try {
        const response = await fetch('api.php?action=list_clients');
        const clients = await response.json();
        console.log('Обновление статусов, клиенты:', clients);
        const rows = document.querySelectorAll('#clientTable tr');
        rows.forEach(row => {
            const uuid = row.getAttribute('data-uuid');
            const client = clients.find(c => c.uuid === uuid);
            if (client) {
                console.log(`Обновление статуса для ${uuid}: last_seen = ${client.last_seen}`);
                const statusDot = row.querySelector('.status-dot');
                const statusText = row.querySelector('.status-text');
                statusDot.classList.remove('status-online', 'status-offline');
                statusDot.classList.add(client.status === 'online' ? 'status-online' : 'status-offline');
                statusText.textContent = formatLastSeen(client.last_seen);
            }
        });
    } catch (err) {
        console.error('Ошибка обновления статусов:', err);
    }
}

async function deleteClient(uuid) {
    if (confirm('Удалить устройство?')) {
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_client', uuid })
            });
            const result = await response.json();
            if (result.error) {
                console.error(result.error);
            } else {
                const row = document.querySelector(`#clientTable tr[data-uuid="${uuid}"]`);
                if (row) row.remove();
                const option = document.querySelector(`#clientSelect option[value="${uuid}"]`);
                if (option) option.remove();
                if (document.querySelector('#clientSelect').value === uuid) {
                    document.querySelector('#playlistTable').innerHTML = '';
                }
            }
        } catch (err) {
            console.error('Ошибка:', err);
        }
    }
}

async function updateClientName(uuid, name) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_name', uuid, name })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            showNotification('Имя изменено');
            const row = document.querySelector(`#clientTable tr[data-uuid="${uuid}"]`);
            if (row) {
                row.querySelector('td:nth-child(3) input').value = name;
            }
            const option = document.querySelector(`#clientSelect option[value="${uuid}"]`);
            if (option) {
                option.textContent = name;
            }
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

async function updateClientShowInfo(uuid, show_info) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_show_info', uuid, show_info: show_info ? 1 : 0 })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
        } else {
            showNotification('Настройка отображения обновлена');
            const row = document.querySelector(`#clientTable tr[data-uuid="${uuid}"]`);
            if (row) {
                row.querySelector('td:nth-child(4) input').checked = show_info;
            }
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

function formatLastSeen(last_seen) {
    const parsedLastSeen = parseInt(last_seen, 10);
    if (isNaN(parsedLastSeen) || parsedLastSeen <= 0) {
        return 'никогда не подключался';
    }
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parsedLastSeen;
    console.log(`last_seen: ${parsedLastSeen}, now: ${now}, diff: ${diff}`);
    if (diff <= 5) {
        return 'в сети';
    } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        const minSuffix = minutes % 10 === 1 && minutes !== 11 ? 'а' : (minutes % 10 >= 2 && minutes % 10 <= 4 && (minutes < 10 || minutes > 20) ? 'ы' : '');
        return `${minutes} минут${minSuffix} назад`;
    } else {
        const hours = Math.floor(diff / 3600);
        const hourSuffix = hours % 10 === 1 && hours !== 11 ? '' : (hours % 10 >= 2 && hours % 10 <= 4 && (hours < 10 || hours > 20) ? 'а' : 'ов');
        return `${hours} час${hourSuffix} назад`;
    }
}