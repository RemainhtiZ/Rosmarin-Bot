import { getKnownShardNames, pushInterShardCommand, readInterShardLocalRoot, readInterShardRemoteRoot } from '@/modules/infra/interShard';
import { getRoomData, getSeason8Data } from '@/modules/utils/memory';
import { estimateSeason8TargetPriority, getSeason8SectorLevel, getSeason8TickScore, roomNameHash } from '@/modules/utils/season8';

type Season8Policy = 'aggressive' | 'balanced' | 'safe';
type ExpandDesired = { claimer: number; builder: number; carry: number; upgrader: number };

const PLAN_PREFIX = 'S8';
const SNAPSHOT_INTERVAL = 5;
const PLAN_DISPATCH_INTERVAL = 25;
const PLAN_STATUS_SYNC_INTERVAL = 50;
const FRONTIER_EVAL_INTERVAL = 5;

const POLICY_DESIRED: Record<Season8Policy, ExpandDesired> = {
    aggressive: { claimer: 1, builder: 2, carry: 2, upgrader: 1 },
    balanced: { claimer: 1, builder: 1, carry: 1, upgrader: 1 },
    safe: { claimer: 1, builder: 1, carry: 0, upgrader: 0 },
};

const ROOM_NAME_REG = /^[WE]\d+[NS]\d+$/;

const isValidRoomName = (roomName: string) => ROOM_NAME_REG.test(String(roomName || ''));

const getPolicy = (roomConfig: any): Season8Policy => {
    const policy = roomConfig?.season8Policy;
    if (policy === 'balanced' || policy === 'safe') return policy;
    return 'aggressive';
};

const getEnabledRoomNames = () => {
    const roomData = getRoomData() as any;
    const names: string[] = [];
    for (const roomName of Object.keys(roomData || {})) {
        if (!roomData[roomName]?.season8Enabled) continue;
        names.push(roomName);
    }
    return names;
};

const toPlanId = (homeRoom: string, targetRoom: string) => {
    return `${PLAN_PREFIX}-${Game.shard.name}-${homeRoom}-${targetRoom}`;
};

const calcDesired = (homeRoom: string, targetRoom: string, policy: Season8Policy, safeRushTarget: boolean): ExpandDesired => {
    const desired = { ...POLICY_DESIRED[policy] };
    const distance = Math.max(1, Game.map.getRoomLinearDistance(homeRoom, targetRoom, true));

    if (distance >= 8) desired.carry += 1;
    if (distance >= 12) desired.carry += 1;

    if (safeRushTarget) {
        desired.claimer = 0;
        if (policy === 'aggressive') {
            desired.builder = Math.max(desired.builder, 2);
            desired.carry = Math.max(desired.carry, 3);
            desired.upgrader = Math.max(desired.upgrader, 4);
        } else {
            desired.builder = Math.max(desired.builder, 1);
            desired.carry = Math.max(desired.carry, 2);
            desired.upgrader = Math.max(desired.upgrader, 2);
        }
    }

    return desired;
};

const applySafeRushPolicy = (room: Room, roomConfig: any) => {
    if (!room?.controller?.my || roomConfig?.season8SafeRush === false) return;
    const safeModeTicks = room.controller.safeMode || 0;
    const isSafeRush = safeModeTicks > 0 && room.controller.level < 4;

    if (isSafeRush) {
        roomConfig.season8SafeRushActiveUntil = Game.time + safeModeTicks;
        roomConfig.outminePower = false;
        roomConfig.outmineDeposit = false;
        if (roomConfig.season8ManagedMode !== false && roomConfig.mode !== 'stop') {
            roomConfig.mode = 'high';
        }
        return;
    }

    if ((roomConfig.season8SafeRushActiveUntil || 0) <= Game.time || room.controller.level >= 4) {
        delete roomConfig.season8SafeRushActiveUntil;
    }
};

const updateCpuBudget = (enabledRoomNames: string[], season8Data: any, roomData: any) => {
    const bucket = Number(Game.cpu.bucket || 0);
    const used = Number(Game.cpu.getUsed() || 0);
    let level: 'normal' | 'constrained' | 'emergency' = 'normal';
    if (bucket < 1500) level = 'emergency';
    else if (bucket < 3500) level = 'constrained';

    season8Data.cpuBudget = {
        tick: Game.time,
        bucket,
        used,
        level,
    };

    for (let i = enabledRoomNames.length; i--;) {
        const roomName = enabledRoomNames[i];
        const cfg = roomData?.[roomName];
        if (!cfg || cfg.season8ManagedMode === false) continue;
        if (cfg.mode === 'stop') continue;

        const safeRushActive = (cfg.season8SafeRushActiveUntil || 0) > Game.time;
        if (safeRushActive) {
            cfg.mode = 'high';
            continue;
        }

        const policy = getPolicy(cfg);
        if (level === 'emergency') {
            cfg.mode = 'low';
        } else if (level === 'constrained') {
            cfg.mode = policy === 'aggressive' ? 'main' : 'low';
        } else {
            cfg.mode = policy === 'aggressive' ? 'high' : 'main';
        }
    }
};

const updateRoomSnapshots = (enabledRoomNames: string[], season8Data: any, roomData: any) => {
    season8Data.rooms ??= {};

    let totalTickScore = 0;
    let controlledRooms = 0;

    for (let i = enabledRoomNames.length; i--;) {
        const roomName = enabledRoomNames[i];
        const cfg = roomData?.[roomName];
        const room = Game.rooms[roomName];
        if (!cfg || !room?.controller?.my) continue;

        applySafeRushPolicy(room, cfg);

        const sectorLevel = getSeason8SectorLevel(roomName);
        const tickScore = getSeason8TickScore(roomName);
        totalTickScore += tickScore;
        controlledRooms++;

        season8Data.rooms[roomName] = {
            roomName,
            sectorLevel,
            tickScore,
            rcl: room.controller.level,
            progress: room.controller.progress,
            progressTotal: room.controller.progressTotal,
            safeMode: room.controller.safeMode || 0,
            mode: cfg.mode || 'main',
            policy: getPolicy(cfg),
            pushTarget: cfg.season8PushTarget,
            safeRush: (cfg.season8SafeRushActiveUntil || 0) > Game.time,
            updateTick: Game.time,
        };
    }

    season8Data.totalTickScore = totalTickScore;
    season8Data.controlledRooms = controlledRooms;
};

const syncSeason8PlanStatuses = (season8Data: any) => {
    const states: Record<string, any> = Object.create(null);

    for (const shardName of getKnownShardNames()) {
        const root = shardName === Game.shard.name ? readInterShardLocalRoot() : readInterShardRemoteRoot(shardName);
        const statusMap = root.status || {};
        const plansMap = root.plans || {};

        for (const [planId, status] of Object.entries(statusMap)) {
            if (!String(planId).startsWith(PLAN_PREFIX + '-')) continue;
            states[planId] = {
                ...(states[planId] || {}),
                planId,
                status: (status as any)?.state || 'running',
                shard: (status as any)?.shard || shardName,
                time: (status as any)?.time || Game.time,
            };
        }

        for (const [planId, plan] of Object.entries(plansMap)) {
            if (!String(planId).startsWith(PLAN_PREFIX + '-')) continue;
            if (!states[planId]) {
                states[planId] = {
                    planId,
                    status: (plan as any)?.status || 'running',
                    shard: shardName,
                    time: (plan as any)?.updated || Game.time,
                };
            }
            states[planId].targetRoom = (plan as any)?.targetRoom;
            states[planId].homeRoom = (plan as any)?.homeRoom;
            states[planId].desired = (plan as any)?.desired;
        }
    }

    season8Data.plans = states;

    const frontier = season8Data.frontier || {};
    for (const roomName of Object.keys(frontier)) {
        const item = frontier[roomName];
        if (!item?.planId) continue;
        item.planStatus = states[item.planId]?.status || item.planStatus || 'unknown';
        item.planStatusTick = Game.time;
    }
};

const runFrontierPlanner = (enabledRoomNames: string[], season8Data: any, roomData: any) => {
    season8Data.frontier ??= {};

    for (let i = enabledRoomNames.length; i--;) {
        const homeRoom = enabledRoomNames[i];
        const cfg = roomData?.[homeRoom];
        if (!cfg) continue;
        if (!isValidRoomName(cfg.season8PushTarget)) continue;

        const room = Game.rooms[homeRoom];
        if (!room?.controller?.my) continue;
        if (cfg.mode === 'stop') continue;

        const targetRoom = String(cfg.season8PushTarget);
        const targetLevel = getSeason8SectorLevel(targetRoom);
        if (!targetLevel) continue;

        const targetVisible = Game.rooms[targetRoom];
        const safeRushTarget = !!(
            targetVisible?.controller?.my &&
            (targetVisible.controller.safeMode || 0) > 0 &&
            targetVisible.controller.level < 4
        );

        const policy = getPolicy(cfg);
        const desired = calcDesired(homeRoom, targetRoom, policy, safeRushTarget);
        const priority = estimateSeason8TargetPriority(homeRoom, targetRoom);
        const planId = toPlanId(homeRoom, targetRoom);
        const desiredSig = `${targetRoom}|${desired.claimer},${desired.builder},${desired.carry},${desired.upgrader}`;

        season8Data.frontier[homeRoom] ??= {
            homeRoom,
            createdTick: Game.time,
            lastDispatchTick: 0,
            planStatus: 'unknown',
            planStatusTick: 0,
        };
        const frontier = season8Data.frontier[homeRoom];
        frontier.homeRoom = homeRoom;
        frontier.targetRoom = targetRoom;
        frontier.targetLevel = targetLevel;
        frontier.priority = priority;
        frontier.policy = policy;
        frontier.planId = planId;
        frontier.desired = desired;

        const isAligned = (Game.time + roomNameHash(homeRoom)) % PLAN_DISPATCH_INTERVAL === 0;
        const isChanged = frontier.desiredSig !== desiredSig;
        const stale = Game.time - (frontier.lastDispatchTick || 0) >= 200;
        if (!isChanged && !stale && !isAligned) continue;

        const payload = {
            id: planId,
            homeShard: Game.shard.name,
            homeRoom,
            targetRoom,
            desired,
            status: 'running',
            created: frontier.createdTick || Game.time,
            updated: Game.time,
        };

        pushInterShardCommand({
            toShard: Game.shard.name,
            type: 'expand.set',
            payload,
        } as any);

        frontier.lastDispatchTick = Game.time;
        frontier.desiredSig = desiredSig;
    }
};

const Season8Module = {
    tick: function () {
        const enabledRoomNames = getEnabledRoomNames();
        (global as any).Season8Active = enabledRoomNames.length > 0;
        if (enabledRoomNames.length === 0) return;

        const roomData = getRoomData() as any;
        const season8Data = getSeason8Data() as any;
        season8Data.lastUpdateTick = Game.time;

        updateCpuBudget(enabledRoomNames, season8Data, roomData);

        if (Game.time % SNAPSHOT_INTERVAL === 0) {
            updateRoomSnapshots(enabledRoomNames, season8Data, roomData);
        }

        if (Game.time % FRONTIER_EVAL_INTERVAL === 0 || Game.time % PLAN_DISPATCH_INTERVAL === 0) {
            runFrontierPlanner(enabledRoomNames, season8Data, roomData);
        }

        if (Game.time % PLAN_STATUS_SYNC_INTERVAL === 0) {
            syncSeason8PlanStatuses(season8Data);
        }
    }
};

export { Season8Module };
