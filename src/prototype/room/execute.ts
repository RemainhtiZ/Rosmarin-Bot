import { shouldRun } from '@/modules/infra/qos';
import { getRoomData, getStructData } from '@/modules/utils/memory';
import { MODULE_SWITCH } from '@/constant/config';

export default class RoomExecute extends Room {
    exec() {
        // 处理上一 tick 的 Observer 回调
        this.ObserveCallbackTick();

        const mode = getRoomData()?.[this.name]?.mode;
        if (mode === 'stop') return;
        const lowMode = mode === 'low';
        const highMode = mode === 'high';
        this.updateEnergyState(false);
        // 更新任务池
        this.MissionUpdate();

        // 主动防御处理
        if (MODULE_SWITCH.ROOM.DEFENSE && (!lowMode || Game.time % 15 === 0)) {
            this.activeDefense();
        }

        // 管理房间中的建筑物
        this.SpawnWork();
        this.TowerWork();
        this.LinkWork();
        this.TerminalWork();
        if (!lowMode) {
            if (MODULE_SWITCH.ROOM.LAB) this.LabWork();
            if (MODULE_SWITCH.ROOM.FACTORY) this.FactoryWork();
            if (MODULE_SWITCH.ROOM.POWER_SPAWN) this.PowerSpawnWork();
        }

        if(!shouldRun({ allowLevels: ['normal', 'constrained'] })) return;
        
        // 自动化处理
        if (MODULE_SWITCH.ROOM.AUTO_MARKET) this.autoMarket(); // 自动市场交易
        if (!lowMode) {
            if (MODULE_SWITCH.ROOM.AUTO_BUILD) this.autoBuild(); // 自动建筑
            if (MODULE_SWITCH.ROOM.LAB) this.autoLab(); // 自动Lab合成
            if (MODULE_SWITCH.ROOM.FACTORY) this.autoFactory(); // 自动Factory生产
            if (MODULE_SWITCH.ROOM.POWER_SPAWN) this.autoPower(); // 自动Power处理
            if (MODULE_SWITCH.ROOM.OUTMINE) this.outMine(); // 外矿采集

            // 显示防御cost矩阵
            if (MODULE_SWITCH.ROOM.DEFENSE) this.showDefenseCostMatrix();
        }

        // Observer 工作
        this.ObserveWork();
    }

    // 房间初始化
    init() {
        if (!this.my || !getRoomData()[this.name]) return;

        const structData = getStructData();
        if (!structData[this.name]) {
            structData[this.name] = {
                lab: true,
                factory: true,
                powerSpawn: true,
            } as any;
        }

        // 孵化队列数量由 room.getSpawnMissionNum() 按需统计

        this.initMissionPool(); // 初始化任务池
        this.update();  // 初始化建筑缓存
    }
}
