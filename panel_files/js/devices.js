// Глобальная переменная для хранения данных о клиентах
let clientsData = [];
let isEditingName = false; // Флаг для отслеживания редактирования имени
let isEditingResolution = false; // Флаг для отслеживания редактирования разрешения

// Функция проверки соответствия минимальному разрешению
function checkResolution(clientMinW, clientMinH, currentW, currentH) {
    if (clientMinW === 0 || clientMinH === 0) return true; // ещё не установлено → считаем OK
    return currentW >= clientMinW && currentH >= clientMinH;
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

// Функция получения текста разрешения для отображения
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

// Функция парсинга введенного разрешения (поддержка форматов: "1920x1080", "1920×1080", "1920*1080")
function parseResolutionInput(input) {
    input = input.trim();
    
    // Удаляем все нецифровые символы, кроме разделителей
    const cleanInput = input.replace(/[^\d×x\*]/g, '');
    
    // Разделяем по различным разделителям
    const separators = ['×', 'x', 'X', '*'];
    let width = 0;
    let height = 0;
    
    for (const sep of separators) {
        if (cleanInput.includes(sep)) {
            const parts = cleanInput.split(sep);
            if (parts.length === 2) {
                width = parseInt(parts[0]) || 0;
                height = parseInt(parts[1]) || 0;
                break;
            }
        }
    }
    
    // Если не нашли разделитель, пробуем распарсить как число (возможно, только ширину)
    if (width === 0 && height === 0) {
        const num = parseInt(input);
        if (!isNaN(num) && num > 0) {
            width = num;
            height = Math.round(width * 9 / 16); // Предполагаем 16:9
        }
    }
    
    return { width, height };
}

// Функция форматирования разрешения для ввода
function getResolutionInputValue(width, height) {
    if (width > 0 && height > 0) {
        return `${width}×${height}`;
    }
    return '';
}

async function loadClients() {
    try {
        if (isEditingName || isEditingResolution) return; // Не обновляем во время редактирования

        const response = await fetch('api.php?action=list_clients_with_sizes');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        clientsData = await response.json();

        const grid = document.getElementById('clientsGrid');
        const clientSelect = document.getElementById('clientSelect');

        // Очищаем существующие карточки
        const existingCards = Array.from(grid.querySelectorAll('.client-card'));
        const existingUuids = new Set(existingCards.map(card => card.getAttribute('data-uuid')));
        const newUuids = new Set(clientsData.map(client => client.uuid));

        // Обновляем / создаём карточки
        clientsData.forEach(client => {
            let card = grid.querySelector(`.client-card[data-uuid="${client.uuid}"]`);

            if (!card) {
                card = document.createElement('div');
                card.className = 'client-card bg-gray-800 rounded-lg p-3 shadow border border-gray-700 hover:border-gray-600 transition-all duration-150';
                card.setAttribute('data-uuid', client.uuid);
                grid.appendChild(card);
            }

            updateClientCard(card, client);
        });

        // Удаляем карточки, которых больше нет
        existingCards.forEach(card => {
            const uuid = card.getAttribute('data-uuid');
            if (!newUuids.has(uuid)) {
                card.remove();
            }
        });

        // Обновляем выпадающий список в плейлистах
        updateClientSelect(clientSelect);

        // Показываем/скрываем сообщение об отсутствии устройств
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

// Функция загрузки настроек минимального разрешения
async function loadResolutionSettings() {
    try {
        const response = await fetch('api.php?action=get_resolution_settings');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const settings = await response.json();
        
        MIN_REQUIRED_WIDTH = settings.min_width || 1920;
        MIN_REQUIRED_HEIGHT = settings.min_height || 1080;
        
        console.log('Настройки разрешения загружены:', settings);
    } catch (err) {
        console.error('Ошибка загрузки настроек разрешения:', err);
        // Используем значения по умолчанию
        MIN_REQUIRED_WIDTH = 1920;
        MIN_REQUIRED_HEIGHT = 1080;
    }
}

// Функция обновления карточки клиента (компактный стиль)
function updateClientCard(card, client) {
    const isOnline = client.status === 'online';
    const isPlaying = client.playback_status === 'playing';

    // Данные о разрешении
    const hasResolution = client.width > 0 && client.height > 0;
    const resolutionText = hasResolution 
        ? (client.resolution && client.resolution !== '' ? client.resolution : `${client.width}×${client.height}`)
        : 'Неизвестно';

    const minW = client.min_width || 0;
    const minH = client.min_height || 0;
    const minResolutionText = (minW > 0 && minH > 0) ? `${minW}×${minH}` : '—';

    const meetsRequirements = hasResolution && 
        (minW === 0 || minH === 0 || (client.width >= minW && client.height >= minH));

    const resolutionBorderClass = !hasResolution 
        ? 'border-gray-500' 
        : meetsRequirements 
            ? 'border-green-500' 
            : 'border-red-500';

    const resolutionTextClass = !hasResolution 
        ? 'text-gray-400' 
        : meetsRequirements 
            ? 'text-green-400' 
            : 'text-red-400';

    card.innerHTML = `
        <!-- Верхняя панель: статус, имя, кнопки -->
        <div class="flex justify-between items-center mb-2">
            <!-- Левая часть: статус + имя -->
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <div class="flex-shrink-0">
                    <div class="status-dot ${isOnline ? 'status-online' : 'status-offline'}"></div>
                </div>
                <div class="min-w-0 flex-1 relative">
                    <div class="text-sm font-medium text-gray-100 truncate name-display cursor-pointer hover:text-blue-300 transition-colors"
                         onclick="editName(this, '${client.uuid}')"
                         title="${client.name}">
                        ${client.name}
                    </div>
                
                    <input type="text"
                           class="name-input hidden absolute inset-0 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm font-medium text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 z-10"
                           value="${client.name}"
                           onblur="saveName(this, '${client.uuid}')"
                           onkeydown="if(event.key==='Enter') this.blur(); if(event.key==='Escape') {this.value='${client.name}'; this.classList.add('hidden'); this.previousElementSibling.classList.remove('hidden'); isEditingName=false;}">
                </div>
            </div>

            <!-- Правая часть: кнопки управления (маленькие) -->
            <div class="flex items-center gap-1 flex-shrink-0">
                <!-- Перезапуск -->
                <button class="p-1 rounded hover:bg-gray-700 transition-colors ${isPlaying ? 'text-green-400' : 'text-red-400 hover:bg-red-900'}" 
                        ${isPlaying ? 'disabled' : ''} 
                        onclick="restartPlayback('${client.uuid}')"
                        title="${isPlaying ? 'Воспроизводится' : 'Перезапустить'}">
                    <i class="fas ${isPlaying ? 'fa-play' : 'fa-stop'} text-xs"></i>
                </button>

                <!-- Показать/скрыть UUID -->
                <button class="p-1 rounded hover:bg-gray-700 transition-colors" 
                        onclick="toggleShowInfo('${client.uuid}')"
                        title="${client.show_info ? 'Скрыть UUID' : 'Показать UUID'}">
                    <i class="fas fa-eye${client.show_info ? '' : '-slash'} ${client.show_info ? 'text-green-400' : 'text-gray-400'} text-xs"></i>
                </button>

                <!-- Кнопка УДАЛЕНИЯ устройства -->
                <button class="p-1 rounded hover:bg-red-900/50 transition-colors text-red-400 hover:text-red-300"
                        onclick="deleteClient('${client.uuid}')"
                        title="Удалить устройство">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        </div>

        <!-- UUID (мелкий) -->
        <div class="mb-2">
            <div class="text-xs text-gray-500 font-mono truncate select-all" title="${client.uuid}">
                ${client.uuid}
            </div>
        </div>

        <!-- Разрешение (текущее + минимальное) -->
        <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1 relative">
                <div class="text-sm font-medium text-gray-100 truncate name-display cursor-pointer hover:text-blue-300 transition-colors"
                     onclick="editName(this, '${client.uuid}')"
                     title="${client.name}">
                    ${client.name}
                </div>
            
                <input type="text"
                       class="name-input hidden absolute inset-0 bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 text-sm font-medium text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 z-10 transition-all duration-150"
                       value="${client.name}"
                       placeholder="Введите имя устройства"
                       onblur="saveName(this, '${client.uuid}')"
                       onkeydown="if(event.key==='Enter') this.blur(); if(event.key==='Escape') {this.value='${client.name}'; this.classList.add('hidden'); this.previousElementSibling.classList.remove('hidden'); isEditingName=false;}">
            </div>
        </div>

        <!-- Последнее появление -->
        <div class="mt-2 text-xs text-gray-500">
            Был в сети: ${formatLastSeen(client.last_seen)}
        </div>
    `;
}

// Редактирование минимального разрешения
function editResolution(element, uuid) {
    isEditingResolution = true;
    
    const container = element;
    const displaySpan = container.querySelector('span.font-mono');
    const currentValue = displaySpan.textContent.trim();
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs font-mono text-white w-28 focus:outline-none focus:border-blue-500';
    input.value = currentValue === '—' ? '' : currentValue;
    input.placeholder = '1920×1080';
    
    input.onblur = () => saveResolution(input, uuid);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            container.innerHTML = `
                <span>мин:</span>
                <span class="font-mono">${currentValue}</span>
                <i class="fas fa-pencil-alt text-gray-600 text-[10px]"></i>
            `;
            isEditingResolution = false;
        }
    };
    
    container.innerHTML = '';
    container.appendChild(input);
    input.focus();
    input.select();
}

// Обработка нажатия клавиш при редактировании разрешения
function handleResolutionKeydown(event, input, uuid) {
    if (event.key === 'Enter') {
        input.blur();
    } else if (event.key === 'Escape') {
        // Восстанавливаем исходное значение
        input.value = `${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT}`;
        input.blur();
    }
}

// Сохранение нового минимального разрешения
async function saveResolution(input, uuid) {
    isEditingResolution = false;
    
    const value = input.value.trim();
    const { width: newMinW, height: newMinH } = parseResolutionInput(value);
    
    const container = input.parentElement;
    
    if (newMinW > 0 && newMinH > 0) {
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_client_min_resolution',
                    uuid: uuid,
                    min_width: newMinW,
                    min_height: newMinH
                })
            });
            
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            
            // обновляем локальные данные
            const client = clientsData.find(c => c.uuid === uuid);
            if (client) {
                client.min_width = newMinW;
                client.min_height = newMinH;
            }
            
            showNotification(`Мин. разрешение: ${newMinW}×${newMinH}`);
            
            // перерисовываем карточки
            await reloadAllCards();
            
        } catch (err) {
            showNotification('Ошибка сохранения', 'bg-red-500');
            console.error(err);
        }
    } else if (value === '') {
        // если очистили поле — можно сбросить минимум (по желанию)
        showNotification('Мин. разрешение сброшено', 'bg-yellow-600');
        // здесь можно отправить запрос на сброс min_width/min_height = 0
    } else {
        showNotification('Неверный формат (пример: 1920×1080)', 'bg-red-500');
    }
    
    // восстанавливаем отображение
    const client = clientsData.find(c => c.uuid === uuid);
    const displayValue = (client?.min_width > 0 && client?.min_height > 0) 
        ? `${client.min_width}×${client.min_height}` 
        : '—';
    
    container.innerHTML = `
        <span>мин:</span>
        <span class="font-mono">${displayValue}</span>
        <i class="fas fa-pencil-alt text-gray-600 text-[10px]"></i>
    `;
}

// Функция перезагрузки всех карточек
async function reloadAllCards() {
    const grid = document.getElementById('clientsGrid');
    const cards = grid.querySelectorAll('.client-card');
    
    cards.forEach(card => {
        const uuid = card.getAttribute('data-uuid');
        const client = clientsData.find(c => c.uuid === uuid);
        if (client) {
            updateClientCard(card, client);
        }
    });
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
    const card = display.closest('.client-card');
    const input = card.querySelector('.name-input') || document.createElement('input');
    
    if (!card.querySelector('.name-input')) {
        input.type = 'text';
        input.className = 'bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm font-medium text-white w-full focus:outline-none focus:border-blue-500';
        input.value = display.textContent.trim();
        input.style.display = 'none';
        display.parentNode.insertBefore(input, display.nextSibling);
    }
    
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
    
    input.onblur = () => saveName(input, uuid);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = display.textContent;
            display.classList.remove('hidden');
            input.classList.add('hidden');
            isEditingName = false;
        }
    };
}

async function saveName(input, uuid) {
    isEditingName = false;
    
    const newName = input.value.trim() || 'Без имени';
    const card = input.closest('.client-card');
    const display = card.querySelector('.name-display');
    
    display.textContent = newName;
    display.title = newName;
    display.classList.remove('hidden');
    input.classList.add('hidden');

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_client_name',
                uuid: uuid,
                name: newName
            })
        });
        
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        
        // Обновляем локальные данные
        const client = clientsData.find(c => c.uuid === uuid);
        if (client) client.name = newName;
        
        // Обновляем выпадающий список устройств
        updateClientSelect(document.getElementById('clientSelect'));
        
        showNotification('Имя устройства обновлено');
        
    } catch (err) {
        console.error('Ошибка сохранения имени:', err);
        showNotification('Не удалось сохранить имя', 'bg-red-500');
        // откатываем визуально
        display.textContent = client?.name || 'Без имени';
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
        if (isEditingName || isEditingResolution) return; // Не обновляем во время редактирования
        
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем клиентов при загрузке страницы
    loadClients();
    
    // Устанавливаем интервал обновления статусов (каждые 10 секунд, но с проверкой редактирования)
    setInterval(updateClientStatuses, 10000);
});