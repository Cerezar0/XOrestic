const express = require('express');
const app = express();
const expressWs = require('express-ws')(app);

// Render выдает порт через process.env.PORT
const port = process.env.PORT || 8080;

// Очереди для поиска игроков
const queues = { '3x3': [], '4x4': [] };
let roomIdCounter = 1;

// Создаем WebSocket-обработчик на корневом пути '/'
app.ws('/', (ws, req) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString('utf8'));
            
            if (data.type === 'find_game') {
                const mode = data.mode;
                let queue = queues[mode];
                
                // Очищаем очередь от "мертвых" подключений
                queue = queue.filter(client => client.readyState === 1); // 1 = OPEN
                queues[mode] = queue;
                
                if (queue.length > 0) {
                    const opponent = queue.shift();
                    const roomId = roomIdCounter++;
                    ws.roomId = roomId;
                    opponent.roomId = roomId;
                    
                    ws.send(JSON.stringify({ 
                        type: 'game_start', symbol: 'X', opponentName: opponent.nickname || 'Игрок', roomId: roomId, mode: mode
                    }));
                    opponent.send(JSON.stringify({ 
                        type: 'game_start', symbol: 'O', opponentName: ws.nickname || 'Игрок', roomId: roomId, mode: mode
                    }));
                    console.log(`Игра ${roomId} создана`);
                } else {
                    ws.nickname = data.nickname;
                    queue.push(ws);
                    ws.send(JSON.stringify({ type: 'waiting' }));
                    console.log(`Игрок ${ws.nickname} в очереди ${mode}`);
                }
            }
            
            if (data.type === 'move') {
                // Пересылаем ход сопернику
                expressWs.getWss().clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === 1) {
                        client.send(JSON.stringify({ type: 'opponent_move', index: data.index }));
                    }
                });
            }

            if (data.type === 'leave_game') {
                expressWs.getWss().clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === 1) {
                        client.send(JSON.stringify({ type: 'opponent_left' }));
                    }
                });
                ws.roomId = null;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        queues['3x3'] = queues['3x3'].filter(client => client !== ws);
        queues['4x4'] = queues['4x4'].filter(client => client !== ws);
        if (ws.roomId) {
            expressWs.getWss().clients.forEach((client) => {
                if (client !== ws && client.roomId === ws.roomId && client.readyState === 1) {
                    client.send(JSON.stringify({ type: 'opponent_left' }));
                }
            });
        }
    });
});

// Запускаем HTTP-сервер (Render будет счастлив)
app.listen(port, () => {
    console.log(`Сервер XOrestic запущен на порту ${port}`);
});
