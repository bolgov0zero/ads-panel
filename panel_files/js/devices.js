// Глобальная переменная для хранения данных о клиентах
let clientsData = [];
let isEditingName = false; // Флаг для отслеживания редактирования имени
const MIN_REQUIRED_WIDTH = 1920; // Минимальная ширина (можно сделать настраиваемой)
const MIN_REQUIRED_HEIGHT = 1080; // Минимальная высота (можно сделать настраиваемой)

// Функция проверки соответствия минимальному разрешению
function checkResolution(minWidth, minHeight, currentWidth, currentHeight) {
    return currentWidth >= minWidth && currentHeight >= minHeight;
}

// Функция получения класса для рамки разрешения
function getResolutionBorderClass(width, height, hasResolution) {
    if (!hasResolution) {
        return 'border-gray-500'; // Серый для неизвестного разрешения
    }
    
    const meetsRequirements = checkResolution(MIN_REQUIRED_WIDTH, MIN_REQUIRED_HEIGHT, width, height);
    return meetsRequirements ? 'border-green-500' : 'border-red-500';
}

// Функция получения класса для текста разрешения
function getResolutionTextClass(width, height, hasResolution) {
    if (!hasResolution) {
        return 'text-gray-400'; // Серый для неизвестного разрешения
    }
    
    const meetsRequirements = checkResolution(MIN_REQUIRED_WIDTH, MIN_REQUIRED_HEIGHT, width, height);
    return meetsRequirements ? 'text-green-400' : 'text-red-400';
}

// Функция получения текста разрешения
function getResolutionText(client) {
    const hasResolution = client.width > 0 && client.height > 0;
    
    if (!hasResolution) {
        return 'Неизвестно';
    }
    
    // Используем resolution если есть, иначе формируем из width и height
    if (client.resolution && client.resolution !== '') {
        return client.resolution;
    }
    
    return `${client.width}×${client.height}`;
}

async function loadClients() {
    try {
        if (isEditingName) return; // Не обновляем во время редактирования
        
        const response = await fetch('api.php?action=list_clients_with_sizes');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        clientsData = await response.json();
        const grid = document.getElementById('clientsGrid');
        const clientSelect = document.getElementById('clientSelect');

        // Очищаем сетку клиентов
        const existingCards = Array.from(grid.querySelectorAll('.client-card'));
        const existingUuids = new Set(existingCards.map(card => card.getAttribute('data-uuid')));
        const newUuids = new Set(clientsData.map(client => client.uuid));

        // Обновляем или создаем карточки клиентов
        clientsData.forEach(client => {
            let card = grid.querySelector(`.client-card[data-uuid="${client.uuid}"]`);
            
            if (!card) {
                // Создаем новую карточку
                card = document.createElement('div');
                card.className = 'client-card bg-gray-800 rounded-lg p-3 shadow border border-gray-700 hover:border-gray-600 transition-all duration-150';
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

        // Показываем/скрываем сообщение о пустом списке
        const noClientsMessage = document.getElementById('noClientsMessage');
        if (clientsData.length === 0) {
            noClientsMessage.classList.remove('hidden');
        } else {
            noClientsMessage.classList.add('hidden');
        }

    } catch (err) {
        console.error('Ошибка загрузки клиентов:', err);
        showNotification('Ошибка загрузки устройств', 'bg-red-500');
    }
}

// Функция обновления карточки клиента (компактный стиль)
function updateClientCard(card, client) {
    const isOnline = client.status === 'online';
    const isPlaying = client.playback_status === 'playing';
    
    // Информация о разрешении
    const hasResolution = client.width > 0 && client.height > 0;
    const resolutionText = getResolutionText(client);
    const resolutionBorderClass = getResolutionBorderClass(client.width, client.height, hasResolution);
    const resolutionTextClass = getResolutionTextClass(client.width, client.height, hasResolution);
    const meetsRequirements = hasResolution && 
        checkResolution(MIN_REQUIRED_WIDTH, MIN_REQUIRED_HEIGHT, client.width, client.height);
    
    card.innerHTML = `
        <!-- Верхняя панель: статус и кнопки -->
        <div class="flex justify-between items-center mb-2">
            <!-- Статус и имя -->
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <div class="flex-shrink-0">
                    <div class="status-dot ${isOnline ? 'status-online' : 'status-offline'}"></div>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-gray-100 truncate name-display cursor-pointer hover:text-blue-300 transition-colors" 
                         onclick="editName(this, '${client.uuid}')" title="${client.name}">
                        ${client.name}
                    </div>
                </div>
            </div>
            
            <!-- Кнопки управления -->
            <div class="flex items-center gap-1 flex-shrink-0">
                <button class="p-1 rounded hover:bg-gray-700 transition-colors ${isPlaying ? 'text-green-400' : 'text-red-400 hover:bg-red-900'}" 
                        ${isPlaying ? 'disabled' : ''} 
                        onclick="restartPlayback('${client.uuid}')"
                        title="${isPlaying ? 'Воспроизводится' : 'Перезапустить'}">
                    <i class="fas ${isPlaying ? 'fa-play' : 'fa-stop'} text-xs"></i>
                </button>
                <button class="p-1 rounded hover:bg-gray-700 transition-colors" 
                        onclick="toggleShowInfo('${client.uuid}')"
                        title="${client.show_info ? 'Скрыть UUID' : 'Показать UUID'}">
                    <i class="fas fa-eye${client.show_info ? '' : '-slash'} ${client.show_info ? 'text-green-400' : 'text-gray-400'} text-xs"></i>
                </button>
            </div>
        </div>
        
        <!-- UUID -->
        <div class="mb-2">
            <div class="text-xs text-gray-400 font-mono truncate select-all" title="${client.uuid}">
                ${client.uuid}
            </div>
        </div>
        
        <!-- Поле редактирования имени -->
        <input type="text" class="hidden name-input w-full p-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-gray-100 mb-2" 
               value="${client.name}" 
               onblur="saveName(this, '${client.uuid}')" 
               onkeydown="if(event.key==='Enter') this.blur()">
        
        <!-- Нижняя панель: статус и время -->
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center text-xs">
                <div class="flex items-center gap-1">
                    <span class="text-gray-500">${formatLastSeen(client.last_seen)}</span>
                    <span class="text-gray-600">•</span>
                    <span class="${isPlaying ? 'text-green-500' : 'text-red-500'}">
                        ${isPlaying ? '▶ Воспр.' : '⏹ Стоп'}
                    </span>
                </div>
                <button onclick="deleteClient('${client.uuid}')" 
                        class="text-gray-500 hover:text-red-500 p-0.5 hover:bg-red-500 hover:bg-opacity-10 rounded transition-colors"
                        title="Удалить устройство">
                    <i class="fas fa-trash text-xs"></i>
                </button>
            </div>
            
            <!-- Информация о разрешении экрана -->
            <div class="flex items-center gap-2">
                <i class="fas fa-desktop text-gray-400 text-xs" title="Разрешение экрана"></i>
                <div class="border ${resolutionBorderClass} border-2 rounded-md px-2 py-0.5 bg-gray-800 flex items-center gap-1">
                    <span class="${resolutionTextClass} font-mono text-xs">
                        ${resolutionText}
                    </span>
                    ${!meetsRequirements && hasResolution ? `
                        <i class="fas fa-exclamation-triangle text-red-400 text-xs" 
                           title="Ниже минимального разрешения (${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT})"></i>
                    ` : ''}
                    ${meetsRequirements ? `
                        <i class="fas fa-check text-green-400 text-xs" 
                           title="Соответствует минимальному разрешению"></i>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Функция обновления селектора клиентов (без индикаторов статуса)
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
    
    // Добавляем опции для всех клиентов (без индикаторов статуса)
    clientsData.forEach(client => {
        const option = document.createElement('option');
        option.value = client.uuid;
        option.textContent = client.name; // Только имя, без индикатора
        select.appendChild(option);
    });
    
    // Восстанавливаем выбранное значение, если оно все еще существует
    if (currentValue && clientsData.some(c => c.uuid === currentValue)) {
        select.value = currentValue;
    }
}

// Переключение show_info (теперь отвечает только за показ на экране клиента)
async function toggleShowInfo(uuid) {
    try {
        const client = clientsData.find(c => c.uuid === uuid);
        if (!client) return;

        const newShowInfo = client.show_info ? 0 : 1;
        
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_client_show_info',
                uuid,
                show_info: newShowInfo
            })
        });
        
        const result = await response.json();
        if (!result.error) {
            // Обновляем данные клиента
            client.show_info = newShowInfo;
            
            // Обновляем карточку
            const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
            if (card) {
                updateClientCard(card, client);
            }
            
            showNotification(`UUID ${newShowInfo ? 'показывается' : 'скрыт'} на устройстве`);
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
        const client = clientsData.find(c => c.uuid === uuid);
        if (client) {
            client.playback_status = 'playing';
            const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
            if (card) {
                updateClientCard(card, client);
            }
        }

    } catch (err) {
        console.error('Ошибка перезапуска:', err);
        showNotification('Ошибка перезапуска: ' + err.message, 'bg-red-500');
    }
}

function editName(element, uuid) {
    isEditingName = true;
    const display = element;
    const input = element.closest('.client-card').querySelector('.name-input');
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
}

async function saveName(input, uuid) {
    isEditingName = false;
    const newName = input.value.trim() || 'Без имени';
    const card = input.closest('.client-card');
    const display = card.querySelector('.name-display');
    display.textContent = newName;
    display.title = newName;
    input.classList.add('hidden');
    display.classList.remove('hidden');

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_client_name', uuid, name: newName })
        });
        
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        
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
    if (!confirm('Удалить устройство? Это действие нельзя отменить.')) return;
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_client', uuid })
        });
        const result = await response.json();
        if (!result.error) {
            // Удаляем карточку
            const card = document.querySelector(`.client-card[data-uuid="${uuid}"]`);
            if (card) {
                card.remove();
            }
            
            // Удаляем из данных
            clientsData = clientsData.filter(c => c.uuid !== uuid);
            
            // Обновляем селектор
            const select = document.getElementById('clientSelect');
            updateClientSelect(select);
            
            // Очищаем таблицу плейлиста если удалено выбранное устройство
            if (document.getElementById('clientSelect').value === uuid) {
                const playlistTable = document.getElementById('playlistTable');
                if (playlistTable) {
                    playlistTable.innerHTML = '';
                }
                document.getElementById('clientSelect').value = '';
            }
            
            // Показываем сообщение если нет устройств
            const noClientsMessage = document.getElementById('noClientsMessage');
            if (clientsData.length === 0) {
                noClientsMessage.classList.remove('hidden');
            }
            
            showNotification('Устройство удалено');
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('Ошибка удаления:', err);
        showNotification('Ошибка удаления устройства: ' + err.message, 'bg-red-500');
    }
}

async function updateClientStatuses() {
    try {
        if (isEditingName) return; // Не обновляем во время редактирования
        
        // Загружаем свежие данные
        await loadClients();
        
    } catch (err) {
        console.error('Ошибка обновления статусов:', err);
    }
}

function formatLastSeen(last_seen) {
    const parsed = parseInt(last_seen, 10);
    if (isNaN(parsed) || parsed <= 0) return 'никогда';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parsed;
    
    if (diff <= 10) return 'только что';
    if (diff < 60) return `${diff}с`;
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return `${m}м`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `${h}ч`;
    }
    const d = Math.floor(diff / 86400);
    return `${d}д`;
}

// Функция для обновления минимальных требований к разрешению
function updateResolutionRequirements(minWidth, minHeight) {
    MIN_REQUIRED_WIDTH = minWidth;
    MIN_REQUIRED_HEIGHT = minHeight;
    
    // Перерисовываем все карточки
    const grid = document.getElementById('clientsGrid');
    if (grid) {
        const cards = grid.querySelectorAll('.client-card');
        cards.forEach(card => {
            const uuid = card.getAttribute('data-uuid');
            const client = clientsData.find(c => c.uuid === uuid);
            if (client) {
                updateClientCard(card, client);
            }
        });
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем клиентов при загрузке страницы
    loadClients();
    
    // Устанавливаем интервал обновления статусов (каждые 10 секунд, но с проверкой редактирования)
    setInterval(updateClientStatuses, 10000);
});