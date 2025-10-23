const helpMarkdown = `
- Кнопка поиска сканирует папку с файлами и добавляет их в базу, если они были загружены вручную(например через sftp) или Ads Panel была переустановлена.
- Поддерживается загрузка файлов до 500мб.
- Переконвертировать файлы в формат MP4 можно тут: [freeconvert.com](https://www.freeconvert.com/mp4-converter "https://www.freeconvert.com/mp4-converter")
- PDF только с горизонтальной ориентацией и только одностраничные.
`;

async function loadVersion() {
    const el = document.getElementById('appVersion');
    if (!el) return;
    try {
        const response = await fetch('version');
        if (!response.ok) throw new Error();
        el.textContent = (await response.text()).trim();
    } catch {
        el.textContent = 'Неизвестно';
    }
}

function renderHelpContent() {
    const el = document.getElementById('helpContent');
    if (el) el.innerHTML = marked.parse(helpMarkdown);
}

async function checkUserExists() {
    try {
        const response = await fetch('auth.php?action=check_user_exists');
        const result = await response.json();
        result.exists ? showLoginModal() : showRegisterModal();
    } catch (err) {
        console.error('Ошибка проверки учетной записи:', err);
        showNotification('Ошибка проверки учетной записи', 'bg-red-500');
    }
}

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    const main = document.getElementById('mainContent');
    if (modal) modal.style.display = 'flex';
    if (main) main.classList.add('hidden');
    const err = document.getElementById('loginError');
    if (err) err.style.display = 'none';
}

function showRegisterModal() {
    const modal = document.getElementById('registerModal');
    const main = document.getElementById('mainContent');
    if (modal) modal.style.display = 'flex';
    if (main) main.classList.add('hidden');
    const err = document.getElementById('registerError');
    if (err) err.style.display = 'none';
}

function showChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const main = document.getElementById('mainContent');
    if (modal) modal.style.display = 'flex';
    if (main) main.classList.add('hidden');
    const err = document.getElementById('changePasswordError');
    if (err) err.style.display = 'none';
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const main = document.getElementById('mainContent');
    if (modal) modal.style.display = 'none';
    if (main) main.classList.remove('hidden');
}

async function login() {
    const username = document.getElementById('loginUsername')?.value;
    const password = document.getElementById('loginPassword')?.value;
    const remember = document.getElementById('rememberMe')?.checked;

    if (!username || !password) return;

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        const result = await response.json();
        if (result.success) {
            if (remember) localStorage.setItem('authToken', result.token);
            document.getElementById('loginModal')?.style.setProperty('display', 'none');
            document.getElementById('mainContent')?.classList.remove('hidden');
            initializeApp();
        } else {
            const err = document.getElementById('loginError');
            if (err) err.style.display = 'block';
        }
    } catch (err) {
        showNotification('Ошибка входа', 'bg-red-500');
    }
}

async function register() {
    const username = document.getElementById('registerUsername')?.value;
    const password = document.getElementById('registerPassword')?.value;
    const confirm = document.getElementById('registerConfirmPassword')?.value;
    const err = document.getElementById('registerError');

    if (password !== confirm) {
        if (err) err.textContent = 'Пароли не совпадают', err.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('authToken', result.token);
            document.getElementById('registerModal')?.style.setProperty('display', 'none');
            document.getElementById('mainContent')?.classList.remove('hidden');
            initializeApp();
        } else {
            if (err) err.textContent = result.error || 'Ошибка', err.style.display = 'block';
        }
    } catch {
        showNotification('Ошибка регистрации', 'bg-red-500');
    }
}

async function changePassword() {
    const current = document.getElementById('currentPassword')?.value;
    const newPass = document.getElementById('newPassword')?.value;
    const confirm = document.getElementById('confirmNewPassword')?.value;
    const err = document.getElementById('changePasswordError');

    if (newPass !== confirm) {
        if (err) err.textContent = 'Пароли не совпадают', err.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'change_password', currentPassword: current, newPassword: newPass })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Пароль изменён');
            closeChangePasswordModal();
        } else {
            if (err) err.textContent = result.error || 'Ошибка', err.style.display = 'block';
        }
    } catch {
        showNotification('Ошибка смены пароля', 'bg-red-500');
    }
}

async function deleteAccount() {
    if (!confirm('Удалить учетную запись? Это нельзя отменить.')) return;
    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_account' })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.removeItem('authToken');
            showNotification('Учетная запись удалена');
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(result.error || 'Ошибка', 'bg-red-500');
        }
    } catch {
        showNotification('Ошибка удаления', 'bg-red-500');
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
            // Безопасно скрываем mainContent
            const main = document.getElementById('mainContent');
            if (main) main.classList.add('hidden');
            checkUserExists();
            showNotification('Вы вышли');
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
    if (!token) {
        checkUserExists();
        return;
    }

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify_token', token })
        });
        const result = await response.json();
        if (result.success) {
            const main = document.getElementById('mainContent');
            if (main) main.classList.remove('hidden');
            initializeApp();
        } else {
            localStorage.removeItem('authToken');
            checkUserExists();
        }
    } catch {
        localStorage.removeItem('authToken');
        checkUserExists();
    }
}

function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('bg-gray-800', 'text-gray-100');
    });
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.remove('hidden');
    const btn = document.querySelector(`button[onclick="openTab('${tabId}')"]`);
    if (btn) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-gray-800', 'text-gray-100');
    }
    if (tabId === 'helpTab') renderHelpContent();
}

function showNotification(message, bg = 'bg-green-500') {
    const n = document.getElementById('notification');
    const m = document.getElementById('notificationMessage');
    if (!n || !m) return;
    m.textContent = message;
    n.classList.remove('bg-green-500', 'bg-red-500');
    n.classList.add(bg);
    n.classList.remove('hidden');
    setTimeout(() => n.classList.add('hidden'), 3000);
}

async function loadMessageSettings() {
    try {
        const res = await fetch('api.php?action=get_message_settings');
        const s = await res.json();
        const el = id => document.getElementById(id);
        if (el('messageEnabled')) el('messageEnabled').checked = s.enabled === 1;
        if (el('messageText')) el('messageText').value = s.text || '';
        if (el('messageColor')) el('messageColor').value = s.color || '#ffffff';
        if (el('messageBackgroundColor')) el('messageBackgroundColor').value = s.background_color || '#000000';
        if (el('messageFontSize')) el('messageFontSize').value = s.font_size || 24;
        if (el('messageSpeed')) el('messageSpeed').value = s.speed || 100;
        if (el('messageBold')) el('messageBold').checked = s.bold === 1;
    } catch (err) {
        console.error('Ошибка загрузки настроек:', err);
    }
}

async function updateMessageSettings() {
    const el = id => document.getElementById(id);
    const data = {
        action: 'update_message_settings',
        enabled: el('messageEnabled')?.checked ? 1 : 0,
        text: el('messageText')?.value || '',
        color: el('messageColor')?.value || '#ffffff',
        background_color: el('messageBackgroundColor')?.value || '#000000',
        font_size: parseInt(el('messageFontSize')?.value) || 24,
        speed: parseInt(el('messageSpeed')?.value) || 100,
        bold: el('messageBold')?.checked ? 1 : 0
    };

    try {
        const res = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        showNotification(result.error ? 'Ошибка' : 'Сохранено', result.error ? 'bg-red-500' : 'bg-green-500');
    } catch {
        showNotification('Ошибка', 'bg-red-500');
    }
}

let clientCount = 0;
async function checkNewClients() {
    try {
        const res = await fetch('api.php?action=count_clients');
        const { count } = await res.json();
        if (count !== clientCount) {
            clientCount = count;
            loadClients();
            loadStatusCards();
        } else {
            const active = document.querySelector('.tab-content:not(.hidden)');
            if (active && ['clientTab', 'playlistTab', 'statusTab'].includes(active.id)) {
                updateClientStatuses();
                if (active.id === 'statusTab') loadStatusCards();
            }
        }
    } catch (err) {
        console.error('Ошибка проверки клиентов:', err);
    }
}

function startClientCheck() {
    checkNewClients();
    setInterval(checkNewClients, 2000);
}

function initializeApp() {
    const search = document.getElementById('fileSearch');
    if (search) search.addEventListener('input', filterFiles);
    loadFiles();
    loadClients();
    loadMessageSettings();
    loadStatusCards();
    startClientCheck();
    openTab('fileTab');
    loadVersion();
}

// ГЛАВНОЕ: Запуск только после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
});