const helpMarkdown = `
- Кнопка поиска сканирует папку с файлами и добавляет их в базу, если они были загружены вручную(например через sftp) или Ads Panel была переустановлена.
- Поддерживается загрузка файлов до 500мб.
- Переконвертировать файлы в формат MP4 можно тут: [freeconvert.com](https://www.freeconvert.com/mp4-converter "https://www.freeconvert.com/mp4-converter")
- PDF только с горизонтальной ориентацией и только одностраничные.
`;

async function loadVersion() {
    try {
        const response = await fetch('version');
        if (!response.ok) throw new Error('Не удалось загрузить версию');
        const version = await response.text();
        document.getElementById('appVersion').textContent = version.trim();
    } catch (err) {
        console.error('Ошибка загрузки версии:', err);
        document.getElementById('appVersion').textContent = 'Неизвестно';
    }
}

function renderHelpContent() {
    const helpContent = document.getElementById('helpContent');
    helpContent.innerHTML = marked.parse(helpMarkdown);
}

async function checkUserExists() {
    try {
        const response = await fetch('auth.php?action=check_user_exists', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        console.log('Проверка существования пользователя:', result);
        if (result.exists) {
            showLoginModal();
        } else {
            showRegisterModal();
        }
    } catch (err) {
        console.error('Ошибка проверки учетной записи:', err);
        showNotification('Ошибка проверки учетной записи', 'bg-red-500');
    }
}

function showLoginModal() {
    console.log('Открытие окна входа');
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('loginError').style.display = 'none';
}

function showRegisterModal() {
    console.log('Открытие окна регистрации');
    document.getElementById('registerModal').style.display = 'flex';
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('registerError').style.display = 'none';
}

function showChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('changePasswordError').style.display = 'none';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('changePasswordError').style.display = 'none';
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        const result = await response.json();
        console.log('Результат входа:', result);
        if (result.success) {
            if (remember) {
                localStorage.setItem('authToken', result.token);
            }
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('mainContent').classList.remove('hidden');
            initializeApp();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (err) {
        console.error('Ошибка входа:', err);
        showNotification('Ошибка входа', 'bg-red-500');
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const errorElement = document.getElementById('registerError');

    if (password !== confirmPassword) {
        errorElement.textContent = 'Пароли не совпадают';
        errorElement.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password })
        });
        const result = await response.json();
        console.log('Результат регистрации:', result);
        if (result.success) {
            localStorage.setItem('authToken', result.token);
            document.getElementById('registerModal').style.display = 'none';
            document.getElementById('mainContent').classList.remove('hidden');
            initializeApp();
        } else {
            errorElement.textContent = result.error || 'Ошибка регистрации';
            errorElement.style.display = 'block';
        }
    } catch (err) {
        console.error('Ошибка регистрации:', err);
        showNotification('Ошибка регистрации', 'bg-red-500');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const errorElement = document.getElementById('changePasswordError');

    if (newPassword !== confirmNewPassword) {
        errorElement.textContent = 'Новые пароли не совпадают';
        errorElement.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'change_password', currentPassword, newPassword })
        });
        const result = await response.json();
        if (result.success) {
            document.getElementById('changePasswordModal').style.display = 'none';
            document.getElementById('mainContent').classList.remove('hidden');
            showNotification('Пароль успешно изменен');
        } else {
            errorElement.textContent = result.error || 'Ошибка смены пароля';
            errorElement.style.display = 'block';
        }
    } catch (err) {
        console.error('Ошибка смены пароля:', err);
        showNotification('Ошибка смены пароля', 'bg-red-500');
    }
}

async function deleteAccount() {
    if (!confirm('Вы уверены, что хотите удалить учетную запись? Это действие необратимо.')) {
        return;
    }
    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_account' })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.removeItem('authToken');
            document.getElementById('mainContent').classList.add('hidden');
            showNotification('Учетная запись удалена');
            checkUserExists();
        } else {
            showNotification(result.error || 'Ошибка удаления учетной записи', 'bg-red-500');
        }
    } catch (err) {
        console.error('Ошибка удаления учетной записи:', err);
        showNotification('Ошибка удаления учетной записи', 'bg-red-500');
    }
}

async function logout() {
    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.removeItem('authToken');
            document.getElementById('mainContent').classList.add('hidden');
            checkUserExists();
            showNotification('Вы успешно вышли');
        } else {
            showNotification('Ошибка выхода', 'bg-red-500');
        }
    } catch (err) {
        console.error('Ошибка выхода:', err);
        showNotification('Ошибка выхода', 'bg-red-500');
    }
}

async function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const response = await fetch('auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify_token', token })
            });
            const result = await response.json();
            console.log('Результат проверки токена:', result);
            if (result.success) {
                document.getElementById('mainContent').classList.remove('hidden');
                initializeApp();
            } else {
                localStorage.removeItem('authToken');
                checkUserExists();
            }
        } catch (err) {
            console.error('Ошибка проверки токена:', err);
            localStorage.removeItem('authToken');
            checkUserExists();
        }
    } else {
        checkUserExists();
    }
}

function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-800', 'text-gray-100');
    });
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelector(`button[onclick="openTab('${tabId}')"]`).classList.add('bg-blue-600', 'text-white');
    if (tabId === 'helpTab') {
        renderHelpContent();
    }
}

function showNotification(message, bgClass = 'bg-green-500') {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notificationMessage');
    notificationMessage.textContent = message;
    notification.classList.remove('bg-green-500', 'bg-red-500');
    notification.classList.add(bgClass);
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

async function loadMessageSettings() {
    try {
        const response = await fetch('api.php?action=get_message_settings');
        const settings = await response.json();
        console.log('Загружены настройки сообщения:', settings);
        document.getElementById('messageEnabled').checked = settings.enabled === 1;
        document.getElementById('messageText').value = settings.text || '';
        document.getElementById('messageColor').value = settings.color || '#ffffff';
        document.getElementById('messageBackgroundColor').value = settings.background_color || '#000000';
        document.getElementById('messageFontSize').value = settings.font_size || 24;
        document.getElementById('messageSpeed').value = settings.speed || 100;
        document.getElementById('messageBold').checked = settings.bold === 1;
    } catch (err) {
        console.error('Ошибка загрузки настроек сообщения:', err);
    }
}

async function updateMessageSettings() {
    try {
        const enabled = document.getElementById('messageEnabled').checked ? 1 : 0;
        const text = document.getElementById('messageText').value;
        const color = document.getElementById('messageColor').value;
        const background_color = document.getElementById('messageBackgroundColor').value;
        const font_size = parseInt(document.getElementById('messageFontSize').value) || 24;
        const speed = parseInt(document.getElementById('messageSpeed').value) || 100;
        const bold = document.getElementById('messageBold').checked ? 1 : 0;
        const response = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_message_settings',
                enabled,
                text,
                color,
                background_color,
                font_size,
                speed,
                bold
            })
        });
        const result = await response.json();
        if (result.error) {
            console.error(result.error);
            showNotification('Ошибка сохранения настроек сообщения', 'bg-red-500');
        } else {
            showNotification('Настройки сообщения сохранены');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showNotification('Ошибка сохранения настроек сообщения', 'bg-red-500');
    }
}

let clientCount = 0;
async function checkNewClients() {
    try {
        const response = await fetch('api.php?action=count_clients');
        const result = await response.json();
        if (result.count !== clientCount) {
            clientCount = result.count;
            loadClients();
        }
    } catch (err) {
        console.error('Ошибка проверки новых устройств:', err);
    }
}

function startClientCheck() {
    checkNewClients();
    setInterval(checkNewClients, 2000);
}

function initializeApp() {
    document.getElementById('fileSearch').addEventListener('input', filterFiles);
    loadFiles();
    loadClients();
    loadMessageSettings();
    startClientCheck();
    openTab('fileTab');
    loadVersion();
}

checkAuth();