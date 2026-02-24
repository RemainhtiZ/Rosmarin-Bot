import { log } from "@/utils";
import { BASE_CONFIG } from "@/constant/config";
import { getRoomData } from "@/modules/utils/memory";
import { calcTransactionCostSafe } from "@/modules/utils/marketCompat";

const isSeason8Restricted = () => (global as any).Season8Active === true;

const canSendToTargetInSeason = (targetRoom: string) => {
    const visible = Game.rooms[targetRoom];
    if (visible?.controller?.my && visible.terminal) return true;
    return !!getRoomData(targetRoom);
};

export default {
    terminal: {
        // 立即发送资源
        send(room?: string, target?: string, type?: any, amount?: number){
            if (target && isSeason8Restricted() && !canSendToTargetInSeason(target)) {
                return Error(`Season8 模式仅允许向己方终端发送，目标 ${target} 不合法。`);
            }
            if(room && target && type && amount) {
                const terminal = Game.rooms[room].terminal;
                if (!terminal || terminal.cooldown !== 0) {
                    return Error(`${room} 的终端不存在或处于冷却。`);
                }
                const RESOURCE_ABBREVIATIONS = BASE_CONFIG.RESOURCE_ABBREVIATIONS;
                type = RESOURCE_ABBREVIATIONS[type] || type;
                amount = Math.min(amount, terminal.store[type] || 0);
                if(!amount) {console.log(`${room} 的终端没有足够的 ${type}。`); return;}
                let cost = calcTransactionCostSafe(amount, room, target);
                if(type == RESOURCE_ENERGY && amount + cost > terminal.store[type]) {
                    amount = amount - cost;
                    amount = Math.floor(amount);
                } else if(cost > terminal.store[RESOURCE_ENERGY]) {
                    amount = amount * (terminal.store[RESOURCE_ENERGY] / cost);
                    amount = Math.floor(amount);
                }
                const result = terminal.send(type, amount, target);
                if(result === OK) {
                    cost = calcTransactionCostSafe(amount, room, target);
                    log('资源发送', `${room} -> ${target}, ${amount} ${type}, 传输成本 ${cost}`);
                } else {
                    log('资源发送', `${room} 发送资源失败，错误代码：${result}`);
                }
                return result;
            }
            if(!room && target && type && amount) {
                let total = amount;
                const RESOURCE_ABBREVIATIONS = BASE_CONFIG.RESOURCE_ABBREVIATIONS;
                type = RESOURCE_ABBREVIATIONS[type] || type;
                for (const room of Object.values(Game.rooms)) {
                    if (room.name == target) continue;
                    const terminal = room.terminal;
                    if (!terminal || terminal.cooldown !== 0) continue;
                    let amount = Math.min(total, terminal.store[type] || 0);
                    if(!amount) continue;
                    let cost = calcTransactionCostSafe(amount, room.name, target);
                    if(type == RESOURCE_ENERGY && amount + cost > terminal.store[type]) {
                        amount = amount - cost;
                        amount = Math.floor(amount);
                    } else if(cost > terminal.store[RESOURCE_ENERGY]) {
                        amount = amount * (terminal.store[RESOURCE_ENERGY] / cost);
                        amount = Math.floor(amount);
                    }
                    const result = terminal.send(type, amount, target);
                    if(result === OK) {
                        cost = calcTransactionCostSafe(amount, room.name, target);
                        log('资源发送', `${room.name} -> ${target}, ${amount} ${type}, 传输成本 ${cost}`);
                        total -= amount;
                        if(total <= 0) break;
                    }
                    else {
                        log('资源发送', `${room.name} 发送资源失败，错误代码：${result}`);
                    }
                }
                return OK;
            }
            return ERR_INVALID_ARGS;
        },
        // 显示终端资源
        show({roomName, type}) {
            if(roomName && type) {
                const terminal = Game.rooms[roomName].terminal;
                if (!terminal) {
                    console.log(`${roomName} 的终端不存在。`); return;
                };
                const RESOURCE_ABBREVIATIONS = BASE_CONFIG.RESOURCE_ABBREVIATIONS;
                const res = RESOURCE_ABBREVIATIONS[type] || type;
                console.log(`${roomName} 的终端有 ${terminal.store[res] || 0} 单位的 ${res}`);
            }

            if(!roomName && type) {
                for (const room of Object.values(Game.rooms)) {
                    const terminal = room.terminal;
                    if (!terminal) continue;
                    const RESOURCE_ABBREVIATIONS = BASE_CONFIG.RESOURCE_ABBREVIATIONS;
                    const res = RESOURCE_ABBREVIATIONS[type] || type;
                    console.log(`${room.name} 的终端有 ${terminal.store[res] || 0} 单位的 ${res}`);
                }
            }

            if(roomName && !type) {
                const terminal = Game.rooms[roomName].terminal;
                if (!terminal) {
                    console.log(`${roomName} 的终端不存在。`); return;
                }
                console.log(`${roomName} 的终端有 ${JSON.stringify(terminal.store)}`);
            }

            if(!roomName && !type) {
                for (const room of Object.values(Game.rooms)) {
                    const terminal = room.terminal;
                    if (!terminal) continue;
                    console.log(`${room.name} 的终端有 ${JSON.stringify(terminal.store)}`);
                }
            }
        },
    }
}
