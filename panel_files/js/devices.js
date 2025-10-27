async function loadClients() {
    try {
        const response = await fetch('api.php?action=list_clients');
        const clients = await response.json();
        const grid = document.getElementById('clientsGrid');
        const clientSelect = document.getElementById('clientSelect');

        const existingCards = grid.querySelectorAll('.client-card');
        const existingOptions = Array.from(clientSelect.querySelectorAll('option:not(:first-child)'));

        clients.forEach(client => {
            let card = grid.querySelector(`.client-card[data-uuid="${client.uuid}"]`);
            if (!card) {
                card = document.createElement('div');
                card.className = 'client-card bg-gray-800 rounded-xl p-5 shadow-lg relative';
                card.setAttribute('data-uuid', client.uuid);
                grid.appendChild(card);
            }

            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2">
                        <div class="status-dot ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
                        <span class="text-sm text-gray-400 status-text">${formatLastSeen(client.last_seen)}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="play-button" ${client.playback_status === 'playing' ? 'disabled' : `onclick="restartPlayback('${client.uuid}')"`}>
                            <i class="fas ${client.playback_status === 'playing' ? 'fa-play' : 'fa-stop'} ${client.playback_status === 'playing' ? 'text-green-400' : 'text-red-500'}"></i>
                        </button>
                        <button onclick="toggleShowInfo('${client.uuid}')" class="view-button eye-toggle">
                            <i class="fas fa-eye${client.show_info ? '' : '-slash'} ${client.show_info ? 'text-green-400' : 'text-gray-500'}"></i>
                        </button>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-medium text-gray-100 name-display" onclick="editName(this, '${client.uuid}')">${client.name}</div>
                    <input type="text" class="hidden name-input w-full p-1 bg-gray-700 border border-gray-600 rounded text-gray-100" value="${client.name}" onblur="saveName(this, '${client.uuid}')" onkeydown="if(event.key==='Enter') this.blur()">
                </div>
                <div class="text-xs text-gray-500 font-mono break-all">${client.uuid}</div>
                <div class="absolute rem-button">
                    <button onclick="deleteClient('${client.uuid}')" class="text-red-500 hover:text-red-400 text-sm">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            let option = clientSelect.querySelector(`option[value="${client.uuid}"]`);
            if (!option) {
                option = document.createElement('option');
                option.value = client.uuid;
                clientSelect.appendChild(option);
            }
            option.textContent = client.name;
        });

        existingCards.forEach(card => {
            if (!clients.some(c => c.uuid === card.getAttribute('data-uuid'))) {
                card.remove();
            }
        });
        existingOptions.forEach(opt => {
            if (!clients.some(c => c.uuid === opt.value)) {
                opt.remove();
            }
        });
    } catch (err) {
        console.error('Ошибка загрузки клиентов:', err);
    }
}

// Переключение show_info
async function toggleShowInfo(uuid) {
    const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
    if (!card) return;

    const eyeBtn = card.querySelector('.eye-toggle');
    const icon = eyeBtn.querySelector('i');
    const isCurrentlyOn = icon.classList.contains('fa-eye');

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_client_show_info',
                uuid,
                show_info: isCurrentlyOn ? 0 : 1
            })
        });
        const result = await response.json();
        if (!result.error) {
            if (isCurrentlyOn) {
                icon.classList.remove('fa-eye', 'text-green-400');
                icon.classList.add('fa-eye-slash', 'text-gray-500');
            } else {
                icon.classList.remove('fa-eye-slash', 'text-gray-500');
                icon.classList.add('fa-eye', 'text-green-400');
            }
        }
    } catch (err) {
        console.error('Ошибка переключения:', err);
    }
}

async function restartPlayback(uuid) {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart_playback', uuid })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.error) {
            showNotification('Команда перезапуска отправлена', 'bg-green-500');
            // Обновляем карточки и статусы с небольшой задержкой
            setTimeout(async () => {
                await loadClients();
                await updateClientStatuses();
                // Принудительно сбрасываем статус кнопки
                const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
                if (card) {
                    const playButton = card.querySelector('.play-button');
                    const playIcon = playButton.querySelector('i');
                    playButton.disabled = false; // Активируем кнопку
                    playIcon.classList.remove('fa-play', 'text-green-400');
                    playIcon.classList.add('fa-stop', 'text-red-500');
                }
                console.log('Карточки и статусы обновлены после перезапуска для UUID:', uuid);
            }, 1000); // Уменьшена задержка для более быстрого обновления
        } else {
            showNotification('Ошибка отправки команды перезапуска: ' + result.error, 'bg-red-500');
        }
    } catch (err) {
        console.error('Ошибка перезапуска:', err);
        showNotification('Ошибка перезапуска: ' + err.message, 'bg-red-500');
    }
}

function editName(element, uuid) {
    const display = element;
    const input = display.nextElementSibling;
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
}

async function saveName(input, uuid) {
    const newName = input.value.trim() || 'Без имени';
    const display = input.previousElementSibling;
    display.textContent = newName;
    input.classList.add('hidden');
    display.classList.remove('hidden');

    try {
        await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_name', uuid, name: newName })
        });
        const option = document.querySelector(`#clientSelect option[value="${uuid}"]`);
        if (option) option.textContent = newName;
    } catch (err) {
        console.error('Ошибка сохранения имени:', err);
    }
}

async function deleteClient(uuid) {
    if (!confirm('Удалить устройство?')) return;
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_client', uuid })
        });
        const result = await response.json();
        if (!result.error) {
            document.querySelector(`.client-card[data-uuid="${uuid}"]`)?.remove();
            document.querySelector(`#clientSelect option[value="${uuid}"]`)?.remove();
            if (document.getElementById('clientSelect').value === uuid) {
                document.getElementById('playlistTable').innerHTML = '';
            }
        }
    } catch (err) {
        console.error('Ошибка удаления:', err);
    }
}

async function updateClientStatuses() {
    try {
        const response = await fetch('api.php?action=list_clients', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const clients = await response.json();
        document.querySelectorAll('.client-card').forEach(card => {
            const uuid = card.getAttribute('data-uuid');
            const client = clients.find(c => c.uuid === uuid);
            if (client) {
                const dot = card.querySelector('.status-dot');
                const text = card.querySelector('.status-text');
                const playButton = card.querySelector('.play-button');
                const playIcon = playButton.querySelector('i');
                dot.classList.remove('status-online', 'status-offline');
                dot.classList.add(client.status === 'online' ? 'status-online' : 'status-offline');
                text.textContent = formatLastSeen(client.last_seen);
                playIcon.classList.remove('fa-play', 'fa-stop', 'text-green-400', 'text-red-500');
                playIcon.classList.add(client.playback_status === 'playing' ? 'fa-play' : 'fa-stop', client.playback_status === 'playing' ? 'text-green-400' : 'text-red-500');
                playButton.disabled = client.playback_status === 'playing';
                console.log('Обновлён статус клиента:', client.uuid, 'playback_status:', client.playback_status);
            }
        });
    } catch (err) {
        console.error('Ошибка обновления статусов:', err);
        showNotification('Ошибка обновления статусов', 'bg-red-500');
    }
}

function formatLastSeen(last_seen) {
    const parsed = parseInt(last_seen, 10);
    if (isNaN(parsed) || parsed <= 0) return 'никогда не подключался';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parsed;
    if (diff <= 5) return 'в сети';
    if (diff < 60) return `${diff} сек. назад`;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `${m} мин. назад`;
    }
    const h = Math.floor(diff / 3600);
    return `${h} ч. назад`;
}