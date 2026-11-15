const WebSocket = require('ws');

// Если мы на Render, берем порт оттуда (process.env.PORT). 
// Если на компьютере — используем 8080.
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });
console.log('Сервер XOrestic запущен на порту ' + port);

const queues = { '3x3': [], '4x4': [] };
let roomIdCounter = 1;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Игрок нажал "Найти игру"
            if (data.type === 'find_game') {
                const mode = data.mode; 
                const queue = queues[mode];
                
                // Если в очереди уже кто-то есть — создаем игру
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
                    // Если очередь пуста — ставим игрока ждать
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

            // Игрок вышел из игры
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
        queues['3x3'] = queues['3x3'].filter(client => client !== ws);
        queues['4x4'] = queues['4x4'].filter(client => client !== ws);
        
        if (ws.roomId) {
            wss.clients.forEach((client) => {
                if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'opponent_left' }));
                }
            });
        }
    });
});