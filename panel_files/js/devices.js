let currentEditUuid = null;

async function loadClients() {
    try {
        const response = await fetch('api.php?action=list_clients');
        const clients = await response.json();
        const container = document.getElementById('clientCards');
        const clientSelect = document.getElementById('clientSelect');

        // Очистка
        container.innerHTML = '';
        clientSelect.innerHTML = '<option value="">-- Выберите устройство --</option>';

        if (clients.length === 0) {
            container.innerHTML = '<p class="text-gray-400 col-span-full text-center">Нет подключённых устройств</p>';
            return;
        }

        // Получаем статистику контента
        const contentStats = {};
        for (const client of clients) {
            try {
                const contentRes = await fetch(`api.php?action=list_client_content&uuid=${client.uuid}`);
                const content = await contentRes.json();
                const video = content.filter(c => c.type === 'video').length;
                const pdf = content.filter(c => c.type === 'pdf').length;
                contentStats[client.uuid] = { video, pdf };
            } catch (e) {
                contentStats[client.uuid] = { video: 0, pdf: 0 };
            }
        }

        clients.forEach(client => {
            const stats = contentStats[client.uuid];
            const status = client.status === 'online' ? 'в сети' : formatLastSeen(client.last_seen);
            const statusColor = client.status === 'online' ? 'bg-green-500' : 'bg-red-500 animate-pulse';
            const eyeColor = client.show_info ? 'text-green-400' : 'text-gray-500';

            const card = document.createElement('div');
            card.className = 'bg-gray-800 rounded-xl p-4 shadow-lg cursor-pointer hover:bg-gray-750 transition-all duration-200';
            card.onclick = () => openEditClientModal(client.uuid, client.name, client.show_info);

            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                        <div class="w-3 h-3 rounded-full ${statusColor}"></div>
                        <span class="text-sm text-gray-300">${status}</span>
                    </div>
                    <i class="fas fa-eye ${eyeColor} text-lg"></i>
                </div>
                <h4 class="font-semibold text-lg text-gray-100 mb-1">${escapeHtml(client.name)}</h4>
                <p class="text-sm text-gray-400 mb-3 font-mono">${client.uuid}</p>
                <p class="text-xs text-gray-500">
                    Видео: <strong>${stats.video}</strong> | PDF: <strong>${stats.pdf}</strong>
                </p>
                <div class="mt-4 flex justify-end">
                    <button onclick="event.stopPropagation(); deleteClient('${client.uuid}')" class="text-red-400 hover:text-red-300 text-sm">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            `;

            container.appendChild(card);

            // Опция для плейлиста
            const option = document.createElement('option');
            option.value = client.uuid;
            option.textContent = client.name;
            clientSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Ошибка загрузки устройств:', err);
    }
}

function openEditClientModal(uuid, name, show_info) {
    currentEditUuid = uuid;
    document.getElementById('editClientName').value = name;
    document.getElementById('editClientShowInfo').checked = show_info === 1;
    document.getElementById('editClientModal').style.display = 'flex';
    document.getElementById('editClientError').style.display = 'none';
}

function closeEditClientModal() {
    document.getElementById('editClientModal').style.display = 'none';
    currentEditUuid = null;
}

async function saveClientEdit() {
    const uuid = currentEditUuid;
    const name = document.getElementById('editClientName').value.trim();
    const show_info = document.getElementById找('editClientShowInfo').checked ? 1 : 0;

    if (!name) {
        document.getElementById('editClientError').textContent = 'Имя не может быть пустым';
        document.getElementById('editClientError').style.display = 'block';
        return;
    }

    try {
        const res1 = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_name', uuid, name })
        });
        const res2 = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_show_info', uuid, show_info })
        });

        const r1 = await res1.json();
        const r2 = await res2.json();

        if (r1.error || r2.error) {
            document.getElementById('editClientError').textContent = r1.error || r2.error;
            document.getElementById('editClientError').style.display = 'block';
        } else {
            closeEditClientModal();
            showNotification('Устройство обновлено');
            loadClients();
        }
    } catch (err) {
        console.error('Ошибка сохранения:', err);
    }
}

async function deleteClient(uuid) {
    if (!confirm('Удалить устройство? Это действие нельзя отменить.')) return;

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_client', uuid })
        });
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'bg-red-500');
        } else {
            showNotification('Устройство удалено');
            loadClients();
            if (document.getElementById('clientSelect').value === uuid) {
                document.getElementById('playlistTable').innerHTML = '';
            }
        }
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

async function updateClientStatuses() {
    // Не используется — статус обновляется при полной перезагрузке карточек
}

// Утилита
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatLastSeen(last_seen) {
    const parsed = parseInt(last_seen, 10);
    if (isNaN(parsed) || parsed <= 0) return 'никогда';
    const diff = Math.floor(Date.now() / 1000) - parsed;
    if (diff < 60) return `${diff} сек. назад`;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `${m} мин. назад`;
    }
    const h = Math.floor(diff / 3600);
    return `${h} ч. назад`;
}