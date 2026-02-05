// Глобальная переменная для хранения данных о клиентах
let clientsData = [];

async function loadClients() {
    try {
        const response = await fetch('api.php?action=list_clients');
        clientsData = await response.json();
        const grid = document.getElementById('clientsGrid');
        const clientSelect = document.getElementById('clientSelect');

        // Очищаем сетку клиентов (но сохраняем DOM для оптимизации)
        const existingCards = Array.from(grid.querySelectorAll('.client-card'));
        const existingUuids = new Set(existingCards.map(card => card.getAttribute('data-uuid')));
        const newUuids = new Set(clientsData.map(client => client.uuid));

        // Обновляем или создаем карточки клиентов
        clientsData.forEach(client => {
            let card = grid.querySelector(`.client-card[data-uuid="${client.uuid}"]`);
            
            if (!card) {
                // Создаем новую карточку
                card = document.createElement('div');
                card.className = 'client-card bg-gray-800 rounded-xl p-5 shadow-lg relative';
                card.setAttribute('data-uuid', client.uuid);
                grid.appendChild(card);
            }
            
            // Обновляем содержимое карточки
            updateClientCard(card, client);
        });

        // Удаляем карточки клиентов, которых больше нет
        existingCards.forEach(card => {
            const uuid = card.getAttribute('data-uuid');
            if (!newUuids.has(uuid)) {
                card.remove();
            }
        });

        // Обновляем список в селекторе плейлистов
        updateClientSelect(clientSelect);

    } catch (err) {
        console.error('Ошибка загрузки клиентов:', err);
        showNotification('Ошибка загрузки устройств', 'bg-red-500');
    }
}

// Функция обновления карточки клиента
function updateClientCard(card, client) {
    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex items-center gap-2">
                <div class="status-dot ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
                <span class="text-sm text-gray-400 status-text">${formatLastSeen(client.last_seen)}</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="play-button p-1" ${client.playback_status === 'playing' ? 'disabled' : ''} onclick="restartPlayback('${client.uuid}')">
                    <i class="fas ${client.playback_status === 'playing' ? 'fa-play' : 'fa-stop'} ${client.playback_status === 'playing' ? 'text-green-400' : 'text-red-500'}"></i>
                </button>
                <button onclick="toggleShowInfo('${client.uuid}')" class="p-1 eye-toggle">
                    <i class="fas fa-eye${client.show_info ? '' : '-slash'} ${client.show_info ? 'text-green-400' : 'text-gray-500'}"></i>
                </button>
            </div>
        </div>
        <div class="mb-2">
            <div class="text-lg font-medium text-gray-100 name-display cursor-pointer hover:text-blue-300 transition-colors" 
                 onclick="editName(this, '${client.uuid}')">${client.name}</div>
            <input type="text" class="hidden name-input w-full p-1 bg-gray-700 border border-gray-600 rounded text-gray-100" 
                   value="${client.name}" 
                   onblur="saveName(this, '${client.uuid}')" 
                   onkeydown="if(event.key==='Enter') this.blur()">
        </div>
        <div class="text-xs text-gray-500 font-mono break-all mb-6">${client.uuid}</div>
        <div class="absolute bottom-3 right-3">
            <button onclick="deleteClient('${client.uuid}')" 
                    class="text-red-500 hover:text-red-400 text-sm p-1 hover:bg-red-500 hover:bg-opacity-10 rounded">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// Функция обновления селектора клиентов
function updateClientSelect(select) {
    // Сохраняем текущее значение
    const currentValue = select.value;
    
    // Очищаем все опции кроме первой
    const firstOption = select.querySelector('option:first-child');
    select.innerHTML = '';
    if (firstOption) {
        select.appendChild(firstOption.cloneNode(true));
    } else {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Выберите устройство --';
        select.appendChild(defaultOption);
    }
    
    // Добавляем опции для всех клиентов
    clientsData.forEach(client => {
        const option = document.createElement('option');
        option.value = client.uuid;
        option.textContent = `${client.name} (${client.status === 'online' ? '🟢 онлайн' : '⚫ офлайн'})`;
        select.appendChild(option);
    });
    
    // Восстанавливаем выбранное значение, если оно все еще существует
    if (currentValue && clientsData.some(c => c.uuid === currentValue)) {
        select.value = currentValue;
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
            
            // Обновляем данные клиента
            const client = clientsData.find(c => c.uuid === uuid);
            if (client) {
                client.show_info = isCurrentlyOn ? 0 : 1;
            }
        }
    } catch (err) {
        console.error('Ошибка переключения:', err);
        showNotification('Ошибка переключения отображения UUID', 'bg-red-500');
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

        if (result.error) {
            throw new Error(result.error);
        }

        // Успешно: показываем уведомление
        showNotification('Команда перезапуска отправлена', 'bg-green-500');

        // Обновляем UI локально
        const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
        if (card) {
            const playButton = card.querySelector('.play-button');
            const playIcon = playButton.querySelector('i');

            playButton.disabled = true;
            playIcon.classList.remove('fa-stop', 'text-red-500');
            playIcon.classList.add('fa-play', 'text-green-400');
        }

        // Принудительно обновляем статусы через 1 секунду
        setTimeout(async () => {
            await updateClientStatuses();
        }, 1000);

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
        
        // Обновляем данные клиента
        const client = clientsData.find(c => c.uuid === uuid);
        if (client) {
            client.name = newName;
        }
        
        // Обновляем селектор
        const select = document.getElementById('clientSelect');
        updateClientSelect(select);
        
        showNotification('Имя устройства обновлено');
    } catch (err) {
        console.error('Ошибка сохранения имени:', err);
        showNotification('Ошибка сохранения имени', 'bg-red-500');
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
            // Удаляем карточку
            document.querySelector(`.client-card[data-uuid="${uuid}"]`)?.remove();
            
            // Удаляем из данных
            clientsData = clientsData.filter(c => c.uuid !== uuid);
            
            // Обновляем селектор
            const select = document.getElementById('clientSelect');
            updateClientSelect(select);
            
            // Очищаем таблицу плейлиста если удалено выбранное устройство
            if (document.getElementById('clientSelect').value === uuid) {
                document.getElementById('playlistTable').innerHTML = '';
                document.getElementById('clientSelect').value = '';
            }
            
            showNotification('Устройство удалено');
        }
    } catch (err) {
        console.error('Ошибка удаления:', err);
        showNotification('Ошибка удаления устройства', 'bg-red-500');
    }
}

async function updateClientStatuses() {
    try {
        // Загружаем свежие данные
        await loadClients();
        
        // Обновляем селектор в плейлистах
        const select = document.getElementById('clientSelect');
        if (select) {
            updateClientSelect(select);
        }
        
    } catch (err) {
        console.error('Ошибка обновления статусов:', err);
    }
}

function formatLastSeen(last_seen) {
    const parsed = parseInt(last_seen, 10);
    if (isNaN(parsed) || parsed <= 0) return 'никогда не подключался';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parsed;
    
    if (diff <= 60) return 'в сети';
    if (diff < 60) return `${diff} сек. назад`;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `${m} мин. назад`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `${h} ч. назад`;
    }
    const d = Math.floor(diff / 86400);
    return `${d} дн. назад`;
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем клиентов при загрузке страницы
    loadClients();
    
    // Устанавливаем интервал обновления статусов (каждые 30 секунд)
    setInterval(updateClientStatuses, 30000);
    
    // Обновляем при переходе на вкладку "Устройства"
    document.querySelector('[onclick*="clientTab"]')?.addEventListener('click', () => {
        updateClientStatuses();
    });
});