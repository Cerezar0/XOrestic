const WebSocket = require('ws');

// Render автоматически выдает порт через process.env.PORT
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });
console.log('Сервер XOrestic запущен на порту ' + port);

const queues = { '3x3': [], '4x4': [] };
let roomIdCounter = 1;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString('utf8')); // Явно читаем UTF-8 (для русских ников)
            
            // Игрок нажал "Найти игру"
            if (data.type === 'find_game') {
                const mode = data.mode; 
                let queue = queues[mode];
                
                // 1. Очищаем очередь от "мертвых" подключений (если кто-то закрыл вкладку)
                queue = queue.filter(client => client.readyState === WebSocket.OPEN);
                queues[mode] = queue; // Обновляем очередь
                
                // 2. Если в очереди уже кто-то есть — создаем игру
                if (queue.length > 0) {
                    const opponent = queue.shift(); 
                    
                    const roomId = roomIdCounter++;
                    ws.roomId = roomId;
                    opponent.roomId = roomId;
                    
                    // Отправляем данные первому игроку (он будет X)
                    ws.send(JSON.stringify({ 
                        type: 'game_start', 
                        symbol: 'X', 
                        opponentName: opponent.nickname || 'Игрок', 
                        roomId: roomId, 
                        mode: mode 
                    }));
                    
                    // Отправляем данные второму игроку (он будет O)
                    opponent.send(JSON.stringify({ 
                        type: 'game_start', 
                        symbol: 'O', 
                        opponentName: ws.nickname || 'Игрок', 
                        roomId: roomId, 
                        mode: mode 
                    }));
                    
                    console.log(`Игра ${roomId} создана в режиме ${mode}`);
                } else {
                    // 3. Если очередь пуста — ставим игрока ждать
                    ws.nickname = data.nickname;
                    queue.push(ws);
                    ws.send(JSON.stringify({ type: 'waiting' }));
                    console.log(`Игрок ${ws.nickname} в очереди ${mode}`);
                }
            }
            
            // Игрок сделал ход
            if (data.type === 'move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            type: 'opponent_move', 
                            index: data.index 
                        }));
                    }
                });
            }

            // Игрок вышел из игры (нажал "В меню" или "Отмена")
            if (data.type === 'leave_game') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'opponent_left' }));
                    }
                });
                ws.roomId = null;
            }
        } catch (e) { 
            console.error("Ошибка обработки сообщения:", e); 
        }
    });

    // Если соединение закрылось (вкладку закрыли)
    ws.on('close', () => {
        // Удаляем из очередей
        queues['3x3'] = queues['3x3'].filter(client => client !== ws);
        queues['4x4'] = queues['4x4'].filter(client => client !== ws);
        
        // Если был в комнате — сообщаем сопернику
        if (ws.roomId) {
            wss.clients.forEach((client) => {
                if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'opponent_left' }));
                }
            });
        }
    });
});
