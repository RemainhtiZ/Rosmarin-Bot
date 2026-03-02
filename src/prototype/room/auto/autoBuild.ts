import LayoutPlanner from "@/modules/feature/planner/layoutPlanner"
import { getLayoutData, getRoomData } from "@/modules/utils/memory";



export default class AutoBuild extends Room {
    // 自动建筑
    autoBuild() {
        this.trimSeason8RoadSites();
        if (Game.cpu.bucket < 100) return;
        
        if (Game.time % 100 !== (this.memory['index']||0)) return;

        // 开启了自动建造, 且有布局Memory, 则自动建筑
        const memory = getRoomData()[this.name];
        const layoutMemory = getLayoutData(this.name);
        if (memory && memory.autobuild && layoutMemory &&
            Object.keys(layoutMemory).length) {
            LayoutPlanner.plannerCreateSite(this, layoutMemory, { maxSites: 10 });
        }

        // 关键建筑造rampart
        if (this.level < 7) return;
        const structures = this.getStructures() || [];
        for (const s of ['spawn', 'tower', 'storage', 'terminal', 'factory', 'lab', 'nuker', 'powerSpawn']) {
            let structs = structures.filter((o) => o.structureType == s);
            for (const struct of structs) {
                if (!struct||!struct.pos) continue;
                const S = struct.pos.lookFor(LOOK_STRUCTURES);
                // 已有rampart则跳过
                if (S.some((o:any) => o.structureType == 'rampart')) continue;
                this.createConstructionSite(struct.pos.x, struct.pos.y, 'rampart');
            }
        }
    }

    private trimSeason8RoadSites() {
        const roomCfg = getRoomData()?.[this.name] as any;
        const isSeason8Room = !!roomCfg?.season8Enabled || (global as any).Season8Active === true;
        if (!isSeason8Room) return;

        let cap: number | null = null;
        if (this.level <= 3) cap = 0;
        else if (this.level === 4) cap = 1;
        else if (this.level === 5) cap = 2;
        if (cap === null) return;

        const roadSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (s) => s.structureType === STRUCTURE_ROAD
        });
        if (roadSites.length <= cap) return;

        roadSites.sort((a, b) => (b.progress || 0) - (a.progress || 0));
        for (let i = cap; i < roadSites.length; i++) {
            roadSites[i].remove();
        }
    }
}
