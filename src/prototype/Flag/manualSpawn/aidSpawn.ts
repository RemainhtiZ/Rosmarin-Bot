import { compressBodyConfig } from "@/modules/utils/compress";
import { log } from "@/utils";
import { AidBodys } from "./config";
import { getSpawnRoomOrRemove, parseFlagNumber, tickThrottle } from "../utils";

export default class AidSpawnFunction extends Flag {
    // 旗帜触发的孵化控制
    handleAidSpawnFlag(): boolean {
        const flagName = this.name;
        // 节流：每 10 tick 扫描一次，减少 CPU 开销
        if (Game.time % 10) return true;
        if (flagName.startsWith('AID-BUILD/')) return this.handleAidBuildFlag(flagName);
        if (flagName.startsWith('AID-UPGRADE/')) return this.handleAidUpgradeFlag(flagName);
        if (flagName.startsWith('AID-UUP/')) return this.handleAidUupFlag(flagName);
        if (flagName.startsWith('AID-ENERGY/')) return this.handleAidEnergyFlag(flagName);
        if (flagName.startsWith('JUMP/')) return this.handleJumpFlag(flagName);
        if (flagName.startsWith('CLAIM/')) return this.handleClaimFlag(flagName);
        if (flagName.startsWith('RESERVE/')) return this.handleReserveFlag(flagName);

        return true;
    }

    // 增援建造
    // AID-BUILD_孵化房间_S-能量源房间_T-间隔
    private handleAidBuildFlag(flagName: string): boolean {
        if (!flagName.startsWith('AID-BUILD/')) return false;

        const spawnInterval = this.getSpawnIntervalFromName();
        if (!this.timeCheck(spawnInterval)) return true;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;
        const sourceRoom = flagName.match(/\/S-([EW][1-9]+[NS][1-9]+)/)?.[1] || targetRoom;

        let bodys: any[] = [];
        const memory = { sourceRoom, targetRoom } as CreepMemory;

        // 是否BOOST
        const boost = this.getBoostTierFromName(flagName);
        if (boost && AidBodys['aid-build'][boost]) {
            const config = AidBodys['aid-build'][boost];
            bodys = config.bodypart || [];
            const boostmap = config.boostmap;
            if (room.CheckBoostRes(bodys, boostmap)) {
                memory['boostmap'] = boostmap;
                memory['boostOwnerId'] = `${flagName}:${Game.time}`;
            } else {
                bodys = [];
                delete memory['boostmap'];
            }
        }

        const ret = room.SpawnMissionAdd('', compressBodyConfig(bodys), -1, 'aid-build', memory);
        if (ret === OK && memory['boostmap']) {
            room.AssignBoostTaskByBody(bodys, memory['boostmap'] as any, memory['boostOwnerId'] as any);
        }
        return true;
    }

    // 增援升级
    // AID-UPGRADE_孵化房间_T间隔
    private handleAidUpgradeFlag(flagName: string): boolean {
        if (!flagName.startsWith('AID-UPGRADE/')) return false;

        const spawnInterval = this.getSpawnIntervalFromName();
        if (!this.timeCheck(spawnInterval)) return true;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;

        let bodys: any[] = [];
        const memory = { home: targetRoom, targetRoom } as CreepMemory;

        // 是否BOOST
        const boost = this.getBoostTierFromName(flagName);
        if (boost && AidBodys['aid-upgrade'][boost]) {
            const config = AidBodys['aid-upgrade'][boost];
            bodys = config.bodypart || [];
            const boostmap = config.boostmap;
            if (room.CheckBoostRes(bodys, boostmap)) {
                memory['boostmap'] = boostmap;
                memory['boostOwnerId'] = `${flagName}:${Game.time}`;
            } else {
                bodys = [];
                delete memory['boostmap'];
            }
        }

        const ret = room.SpawnMissionAdd('', compressBodyConfig(bodys), -1, 'aid-upgrade', memory);
        if (ret === OK && memory['boostmap']) {
            room.AssignBoostTaskByBody(bodys, memory['boostmap'] as any, memory['boostOwnerId'] as any);
        }
        return true;
    }

    // 增援冲级
    // AID-UUP_孵化房间_T间隔
    private handleAidUupFlag(flagName: string): boolean {
        if (!flagName.startsWith('AID-UUP/')) return false;

        const spawnInterval = this.getSpawnIntervalFromName();
        if (!this.timeCheck(spawnInterval)) return true;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;
        room.SpawnMissionAdd('', compressBodyConfig([]), -1, 'up-upgrade', { home: targetRoom } as CreepMemory);
        return true;
    }

    // 增援能量
    // AID-ENERGY_孵化房间_B-BOOST配置_T间隔
    private handleAidEnergyFlag(flagName: string): boolean {
        if (!flagName.startsWith('AID-ENERGY/')) return false;

        const spawnInterval = this.getSpawnIntervalFromName();
        if (!this.timeCheck(spawnInterval)) return true;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;

        let bodys: any[] = [];
        const memory = {
            sourceRoom: room.name,
            targetRoom: targetRoom,
            resource: RESOURCE_ENERGY,
        } as any;

        // 是否BOOST
        const boost = this.getBoostTierFromName(flagName);
        if (boost && AidBodys['aid-carry'][boost]) {
            bodys = AidBodys['aid-carry'][boost].bodypart || [];
            const boostmap = AidBodys['aid-carry'][boost].boostmap || {};
            if (room.CheckBoostRes(bodys, boostmap)) {
                memory['boostmap'] = boostmap;
                memory['boostOwnerId'] = `${flagName}:${Game.time}`;
            } else {
                bodys = [];
                delete memory['boostmap'];
            }
        }

        const ret = room.SpawnMissionAdd('', bodys, -1, 'aid-carry', memory);
        if (ret === OK && memory['boostmap']) {
            room.AssignBoostTaskByBody(bodys, memory['boostmap'], memory['boostOwnerId'] as any);
        }
        return true;
    }

    // 占领房间（优化：同时孵化 claimer + aid-build；满足条件时自动关闭）
    // Jump-room flow:
    // 1) prepare target room with builder/carry, build container and stock energy
    // 2) send one claimer only when ready
    // 3) after claim keep enough builder/carry until spawn is settled
    // Flag format:
    // JUMP/<spawnRoom>/B-<preBuilder>/C-<preCarry>/E-<energy>/PB-<postBuilder>/PC-<postCarry>
    private handleJumpFlag(flagName: string): boolean {
        if (!flagName.startsWith('JUMP/')) return false;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;
        const targetRoomObj = Game.rooms[targetRoom];
        const jumpMem = this.memory as any;

        const preBuilder = Math.max(1, parseFlagNumber(flagName, 'B', 4));
        const preCarry = Math.max(1, parseFlagNumber(flagName, 'C', 2));
        const postBuilder = Math.max(preBuilder, parseFlagNumber(flagName, 'PB', preBuilder));
        const postCarry = Math.max(preCarry, parseFlagNumber(flagName, 'PC', preCarry));
        const minEnergy = Math.max(500, parseFlagNumber(flagName, 'E', 3000));

        const anchorPos = this.getJumpAnchorPos(targetRoomObj, jumpMem);
        if (targetRoomObj && anchorPos) {
            this.ensureJumpContainerSite(targetRoomObj, anchorPos, jumpMem);
        }

        const counts = this.getJumpRoleCounts(room, flagName, targetRoom);
        const isClaimed = !!targetRoomObj?.my;
        const desiredBuilder = isClaimed ? postBuilder : preBuilder;
        const desiredCarry = isClaimed ? postCarry : preCarry;

        if (counts.builder < desiredBuilder) {
            const memory = {
                sourceRoom: targetRoom,
                targetRoom,
                spawnFlag: flagName,
                jumpMode: true
            } as any;
            const ret = room.SpawnMissionAdd('', compressBodyConfig([]), -1, 'aid-build', memory);
            if (ret === OK) {
                log('JUMP', `${room.name} -> ${targetRoom} spawn aid-build (${counts.builder + 1}/${desiredBuilder})`);
            }
            return true;
        }

        if (counts.carry < desiredCarry) {
            const memory = {
                sourceRoom: room.name,
                targetRoom,
                resource: RESOURCE_ENERGY,
                spawnFlag: flagName,
                jumpMode: true
            } as any;
            const ret = room.SpawnMissionAdd('', '', -1, 'aid-carry', memory);
            if (ret === OK) {
                log('JUMP', `${room.name} -> ${targetRoom} spawn aid-carry (${counts.carry + 1}/${desiredCarry})`);
            }
            return true;
        }

        const hasContainer = !!(targetRoomObj && this.hasJumpContainer(targetRoomObj));
        const stagedEnergy = targetRoomObj ? this.getJumpEnergyStock(targetRoomObj) : 0;
        const readyForClaim = !isClaimed
            && hasContainer
            && stagedEnergy >= minEnergy
            && counts.builderLive >= preBuilder
            && counts.carryLive >= preCarry;

        if (readyForClaim && counts.claimer < 1) {
            const memory = { targetRoom, spawnFlag: flagName, jumpMode: true } as any;
            const ret = room.SpawnMissionAdd('', '', -1, 'claimer', memory);
            if (ret === OK) {
                log('JUMP', `${room.name} -> ${targetRoom} ready, spawn claimer`);
            }
            return true;
        }

        if (!isClaimed && !readyForClaim && Game.time - (jumpMem['lastJumpHintTime'] || 0) >= 100) {
            jumpMem['lastJumpHintTime'] = Game.time;
            log('JUMP', `${targetRoom} preparing: container=${hasContainer ? 'Y' : 'N'}, energy=${stagedEnergy}/${minEnergy}, builderLive=${counts.builderLive}/${preBuilder}, carryLive=${counts.carryLive}/${preCarry}, claimer=${counts.claimer}`);
        }

        if (isClaimed && targetRoomObj) {
            const hasSpawn = targetRoomObj.find(FIND_MY_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_SPAWN
            }).length > 0;
            const siteNum = targetRoomObj.find(FIND_MY_CONSTRUCTION_SITES).length;
            if (hasSpawn && siteNum === 0) {
                log('JUMP', `${targetRoom} settled (spawn + no site), remove jump flag`);
                this.remove();
            }
        }

        return true;
    }

    private getJumpAnchorPos(targetRoomObj: Room | undefined, jumpMem: any): RoomPosition | undefined {
        if (typeof jumpMem.jumpCx === 'number' && typeof jumpMem.jumpCy === 'number') {
            return new RoomPosition(jumpMem.jumpCx, jumpMem.jumpCy, this.pos.roomName);
        }
        if (!targetRoomObj) return this.pos;

        if (this.pos.walkable()) {
            jumpMem.jumpCx = this.pos.x;
            jumpMem.jumpCy = this.pos.y;
            return this.pos;
        }

        const fallback = this.pos.nearPos(1).find((p) => p.walkable());
        if (fallback) {
            jumpMem.jumpCx = fallback.x;
            jumpMem.jumpCy = fallback.y;
            return fallback;
        }

        return this.pos;
    }

    private ensureJumpContainerSite(targetRoom: Room, anchorPos: RoomPosition, jumpMem: any): void {
        if (anchorPos.roomName !== targetRoom.name) return;

        const hasContainer = anchorPos.lookFor(LOOK_STRUCTURES).some((s) => s.structureType === STRUCTURE_CONTAINER);
        if (hasContainer) return;

        const hasSite = anchorPos.lookFor(LOOK_CONSTRUCTION_SITES).some((s) => s.structureType === STRUCTURE_CONTAINER);
        if (hasSite) return;

        let ret = anchorPos.createConstructionSite(STRUCTURE_CONTAINER);
        if (ret === OK || ret === ERR_FULL) {
            jumpMem.jumpCx = anchorPos.x;
            jumpMem.jumpCy = anchorPos.y;
            return;
        }
        if (ret !== ERR_INVALID_TARGET) return;

        const fallback = anchorPos.nearPos(1).find((p) => p.walkable());
        if (!fallback) return;
        ret = fallback.createConstructionSite(STRUCTURE_CONTAINER);
        if (ret === OK || ret === ERR_FULL) {
            jumpMem.jumpCx = fallback.x;
            jumpMem.jumpCy = fallback.y;
        }
    }

    private hasJumpContainer(targetRoom: Room): boolean {
        const containers = targetRoom.find(FIND_STRUCTURES, {
            filter: (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER
        });
        return containers.length > 0;
    }

    private getJumpEnergyStock(targetRoom: Room): number {
        let energy = 0;

        const containers = targetRoom.find(FIND_STRUCTURES, {
            filter: (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER
        });
        for (const container of containers) {
            energy += container.store[RESOURCE_ENERGY] || 0;
        }

        const dropped = targetRoom.find(FIND_DROPPED_RESOURCES, {
            filter: (r) => r.resourceType === RESOURCE_ENERGY
        });
        for (const res of dropped) {
            energy += res.amount || 0;
        }

        const ruins = targetRoom.find(FIND_RUINS);
        for (const ruin of ruins) {
            energy += ruin.store[RESOURCE_ENERGY] || 0;
        }

        const tombstones = targetRoom.find(FIND_TOMBSTONES);
        for (const tombstone of tombstones) {
            energy += tombstone.store[RESOURCE_ENERGY] || 0;
        }

        return energy;
    }

    private getJumpRoleCounts(spawnRoom: Room, flagName: string, targetRoom: string) {
        let builderLive = 0;
        let carryLive = 0;
        let claimerLive = 0;
        let builderQueued = 0;
        let carryQueued = 0;
        let claimerQueued = 0;

        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory?.spawnFlag !== flagName) continue;
            if (creep.memory?.targetRoom !== targetRoom) continue;

            if (creep.memory?.role === 'aid-build') builderLive++;
            else if (creep.memory?.role === 'aid-carry') carryLive++;
            else if (creep.memory?.role === 'claimer') claimerLive++;
        }

        const tasks = spawnRoom.getAllMissionFromPool('spawn') || [];
        for (const task of tasks as any[]) {
            const memory = task?.data?.memory as any;
            if (!memory) continue;
            if (memory.spawnFlag !== flagName) continue;
            if (memory.targetRoom !== targetRoom) continue;

            if (memory.role === 'aid-build') builderQueued++;
            else if (memory.role === 'aid-carry') carryQueued++;
            else if (memory.role === 'claimer') claimerQueued++;
        }

        return {
            builderLive,
            carryLive,
            claimerLive,
            builderQueued,
            carryQueued,
            claimerQueued,
            builder: builderLive + builderQueued,
            carry: carryLive + carryQueued,
            claimer: claimerLive + claimerQueued
        };
    }

    private handleClaimFlag(flagName: string): boolean {
        if (!flagName.startsWith('CLAIM/')) return false;

        const room = this.getSpawnRoomFromName();
        if (!room) return true;

        const targetRoom = this.pos.roomName;
        const isNotCenterRoom = !(/^[EW]\d*[456][NS]\d*[456]$/.test(targetRoom));
        const isNotHighway = /^[EW]\d*[1-9][NS]\d*[1-9]$/.test(targetRoom);
        if (!isNotCenterRoom || !isNotHighway) {
            this.remove();
            return true;
        }

        const targetRoomObj = Game.rooms[targetRoom];

        // 已经完成“起房”：有 spawn 且没有工地 -> 自动关闭，避免后续误触发继续孵化
        if (targetRoomObj?.my) {
            const hasSpawn = targetRoomObj.find(FIND_MY_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_SPAWN
            }).length > 0;
            const siteNum = targetRoomObj.find(FIND_MY_CONSTRUCTION_SITES).length;
            if (hasSpawn && siteNum === 0) {
                log('CLAIM', `${targetRoom} 已有spawn且无工地，已自动关闭CLAIM流程`);
                this.remove();
                return true;
            }
        }

        // 避免重复孵化 claimer
        let hasClaimer = false;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory?.role !== 'claimer') continue;
            if (creep.memory?.targetRoom !== targetRoom) continue;
            hasClaimer = true;
            break;
        }

        // 目标房间未被占领时，确保有 claimer 在路上
        if (!hasClaimer && (!targetRoomObj || !targetRoomObj.my)) {
            room.SpawnMissionAdd('', '', -1, 'claimer', { targetRoom, spawnFlag: flagName } as any);
            log('CLAIM', `${room.name} 派出了一个 claimer 来占领 ${targetRoom}`);
        }

        // 同步孵化 aid-build 援助建造（不影响单独 AID 旗帜：只统计/控制本 CLAIM 旗帜派生的 builder）
        let claimAidNum = 0;
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory?.role !== 'aid-build') continue;
            if (creep.memory?.targetRoom !== targetRoom) continue;
            if (creep.memory?.spawnFlag !== flagName) continue;
            claimAidNum++;
        }

        const desiredAidNum = 1;
        const claimMemory = this.memory as any;
        const aidInterval = 200;
        const lastAidTime = typeof claimMemory['lastAidBuildTime'] === 'number' ? claimMemory['lastAidBuildTime'] : 0;
        if (claimAidNum < desiredAidNum && Game.time - lastAidTime >= aidInterval) {
            const memory = { sourceRoom: targetRoom, targetRoom: targetRoom, spawnFlag: flagName } as any;
            room.SpawnMissionAdd('', compressBodyConfig([]), -1, 'aid-build', memory);
            claimMemory['lastAidBuildTime'] = Game.time;
            log('CLAIM', `${room.name} 派出了一个 aid-build 援助建造 ${targetRoom}`);
        }

        return true;
    }

    // 预定房间
    private handleReserveFlag(flagName: string): boolean {
        if (!flagName.startsWith('RESERVE/')) return false;

        const spawnInterval = this.getSpawnIntervalFromName(500);
        if (!this.timeCheck(spawnInterval)) return true;
        const room = this.getSpawnRoomFromName();
        if (!room) return true;
        const targetRoom = this.pos.roomName;
        room.SpawnMissionAdd('', '', -1, 'reserver', { targetRoom });
        return true;
    }

    private getBoostTierFromName(flagName: string): string | undefined {
        return flagName.match(/\/B-(\w+)/)?.[1] as string || undefined;
    }

    private getSpawnIntervalFromName(Default = 500) {
        return parseFlagNumber(this.name, 'T', Default)
    }

    private getSpawnRoomFromName() {
        return getSpawnRoomOrRemove(this)
    }

    private timeCheck(spawnInterval: number) {
        return tickThrottle(this, spawnInterval)
    }
}
