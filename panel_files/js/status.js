async function loadStatusCards() {
    try {
        const [clientsRes, contentRes] = await Promise.all([
            fetch('api.php?action=list_clients'),
            fetch('api.php?action=list_all_client_content')
        ]);
        const clients = await clientsRes.json();
        const allContent = await contentRes.json();

        const cardsContainer = document.getElementById('statusCards');
        cardsContainer.innerHTML = '';

        if (clients.length === 0) {
            cardsContainer.innerHTML = '<p class="text-gray-400 text-center col-span-full">Нет подключённых устройств</p>';
            return;
        }

        clients.forEach(client => {
            const clientContent = allContent.filter(c => c.uuid === client.uuid);
            const videoCount = clientContent.filter(c => c.type === 'video').length;
            const pdfCount = clientContent.filter(c => c.type === 'pdf').length;

            const isOnline = client.status === 'online';
            const lastSeenText = formatLastSeen(client.last_seen);

            const card = document.createElement('div');
            card.className = 'bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col';
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2">
                        <div class="status-dot ${isOnline ? 'status-online' : 'status-offline'}"></div>
                        <span class="text-sm font-medium ${isOnline ? 'text-green-400' : 'text-gray-400'}">
                            ${isOnline ? 'в сети' : lastSeenText}
                        </span>
                    </div>
                    <i class="fas fa-eye ${client.show_info ? 'text-green-400' : 'text-gray-500'} text-lg"></i>
                </div>
                <div class="mb-2">
                    <h4 class="font-semibold text-lg text-white truncate">${client.name}</h4>
                </div>
                <div class="mb-3">
                    <p class="text-xs text-gray-400 font-mono break-all">${client.uuid}</p>
                </div>
                <div class="flex justify-between text-sm text-gray-300 border-t border-gray-700 pt-2">
                    <span>Видео: <strong>${videoCount}</strong></span>
                    <span>PDF: <strong>${pdfCount}</strong></span>
                </div>
            `;
            cardsContainer.appendChild(card);
        });
    } catch (err) {
        console.error('Ошибка загрузки статуса устройств:', err);
        document.getElementById('statusCards').innerHTML = '<p class="text-red-400 text-center col-span-full">Ошибка загрузки</p>';
    }
}

function formatLastSeen(last_seen) {
    const parsedLastSeen = parseInt(last_seen, 10);
    if (isNaN(parsedLastSeen) || parsedLastSeen <= 0) {
        return 'никогда';
    }
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parsedLastSeen;
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