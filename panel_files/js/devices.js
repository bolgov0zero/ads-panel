// Глобальная переменная для хранения данных о клиентах
let clientsData = [];
let isEditingName = false; // Флаг для отслеживания редактирования имени
let isEditingResolution = false; // Флаг для отслеживания редактирования разрешения
let MIN_REQUIRED_WIDTH = 1920; // Минимальная ширина (по умолчанию)
let MIN_REQUIRED_HEIGHT = 1080; // Минимальная высота (по умолчанию)

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
        
        // Загружаем настройки минимального разрешения
        await loadResolutionSettings();
        
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
    
    // Информация о разрешении
    const hasResolution = client.width > 0 && client.height > 0;
    const resolutionText = getResolutionText(client);
    const resolutionBorderClass = getResolutionBorderClass(client.width, client.height, hasResolution);
    const resolutionTextClass = getResolutionTextClass(client.width, client.height, hasResolution);
    const meetsRequirements = hasResolution && 
        checkResolution(MIN_REQUIRED_WIDTH, MIN_REQUIRED_HEIGHT, client.width, client.height);
    
    // Текущее минимальное разрешение
    const minResolutionText = `${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT}`;
    
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
                <i class="fas fa-desktop text-gray-400 text-xs" title="Разрешение экрана устройства / Минимальное требование: ${minResolutionText}"></i>
                <div class="border ${resolutionBorderClass} border-2 rounded-md px-2 py-0.5 bg-gray-800 flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" 
                     onclick="editResolution(this, '${client.uuid}')"
                     title="Нажмите чтобы изменить минимальное разрешение. Текущее: ${resolutionText}, Минимальное: ${minResolutionText}">
                    <!-- Отображаемое разрешение -->
                    <span class="resolution-display ${resolutionTextClass} font-mono text-xs">
                        ${resolutionText}
                    </span>
                    
                    <!-- Поле для ввода разрешения -->
                    <input type="text" 
                           class="hidden resolution-input bg-transparent border-none outline-none text-xs font-mono w-20 ${resolutionTextClass}" 
                           value="${minResolutionText}"
                           onblur="saveResolution(this, '${client.uuid}')" 
                           onkeydown="handleResolutionKeydown(event, this, '${client.uuid}')">
                    
                    <!-- Иконки состояния -->
                    ${!meetsRequirements && hasResolution ? `
                        <i class="fas fa-exclamation-triangle text-red-400 text-xs" 
                           title="Ниже минимального разрешения (${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT})"></i>
                    ` : ''}
                    ${meetsRequirements && hasResolution ? `
                        <i class="fas fa-check text-green-400 text-xs" 
                           title="Соответствует минимальному разрешению"></i>
                    ` : ''}
                    ${!hasResolution ? `
                        <i class="fas fa-question text-gray-400 text-xs" 
                           title="Разрешение неизвестно"></i>
                    ` : ''}
                </div>
            </div>
            
            <!-- Подсказка под разрешением -->
            <div class="text-xs text-gray-500 text-center italic">
                Мин: ${minResolutionText}
            </div>
        </div>
    `;
}

// Редактирование минимального разрешения
function editResolution(element, uuid) {
    if (isEditingName || isEditingResolution) return;
    
    isEditingResolution = true;
    const container = element;
    const display = container.querySelector('.resolution-display');
    const input = container.querySelector('.resolution-input');
    
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
    
    // Обработчик для клика вне поля
    const clickOutsideHandler = (e) => {
        if (!container.contains(e.target)) {
            input.blur();
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', clickOutsideHandler);
    }, 10);
    
    // Убираем обработчик после blur
    input.addEventListener('blur', () => {
        document.removeEventListener('click', clickOutsideHandler);
    }, { once: true });
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
    
    const newValue = input.value.trim();
    const container = input.closest('.border-2');
    const display = container.querySelector('.resolution-display');
    
    // Парсим введенное значение
    const { width, height } = parseResolutionInput(newValue);
    
    if (width > 0 && height > 0) {
        // Сохраняем на сервере
        try {
            const response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_resolution_settings',
                    min_width: width,
                    min_height: height
                })
            });
            
            const result = await response.json();
            if (result.error) {
                throw new Error(result.error);
            }
            
            // Обновляем локальные настройки
            MIN_REQUIRED_WIDTH = width;
            MIN_REQUIRED_HEIGHT = height;
            
            // Показываем уведомление
            showNotification(`Минимальное разрешение обновлено: ${width}×${height}`);
            
            // Обновляем все карточки
            await reloadAllCards();
            
        } catch (err) {
            console.error('Ошибка сохранения разрешения:', err);
            showNotification('Ошибка сохранения разрешения: ' + err.message, 'bg-red-500');
            // Восстанавливаем исходное значение в поле
            input.value = `${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT}`;
        }
    } else {
        // Некорректный ввод
        showNotification('Некорректный формат разрешения. Используйте: "1920×1080"', 'bg-red-500');
        input.value = `${MIN_REQUIRED_WIDTH}×${MIN_REQUIRED_HEIGHT}`;
    }
    
    // Возвращаем отображение
    input.classList.add('hidden');
    display.classList.remove('hidden');
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