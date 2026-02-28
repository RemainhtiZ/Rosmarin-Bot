import { createApp } from '@/framework/createApp';
import { PrototypeExtension } from '@/prototype';
import { ConsoleExtension } from '@/console';
import { roomRunner } from '@/boot/RoomRunner';
import { creepRunner } from '@/boot/CreepRunner';
import { powerCreepRunner } from '@/boot/PowerCreepRunner';
import { flagRunner } from '@/boot/FlagRunner';
import { EventModule } from '@/modules/runtime/event';
import { ClearModule  } from '@/modules/runtime/ClearModule';
import { GeneratePixel } from '@/modules/runtime/Pixel';
import { Statistics } from '@/modules/runtime/Statistics';
import { ResourceManage } from '@/modules/runtime/ResourceManage';
import { TeamModule } from '@/modules/runtime/TeamModule';
import { DDModule } from '@/modules/runtime/DD_Module';
import { NukeModule } from '@/modules/runtime/NukeModule';
import { ExpandModule } from '@/modules/runtime/ExpandModule';
import { InterShardModule } from '@/modules/runtime/InterShardModule';
import { MODULE_SWITCH } from '@/constant/config';

import '@/modules/infra/moveOptimization';    // creep移动优化
import '@/modules/infra/structureCache';  // 极致建筑缓存

PrototypeExtension();    // 原型拓展
ConsoleExtension();      // 控制台命令拓展

const App = createApp();

if (MODULE_SWITCH.RUNNER.ROOM) App.set('room', roomRunner);             // room运行
if (MODULE_SWITCH.RUNNER.CREEP) App.set('creep', creepRunner);           // creep运行
if (MODULE_SWITCH.RUNNER.POWER_CREEP) App.set('powerCreep', powerCreepRunner); // powerCreep运行
if (MODULE_SWITCH.RUNNER.FLAG) App.set('flag', flagRunner);             // flag运行

App.on(EventModule); // 事件模块（基础模块默认启用）
if (MODULE_SWITCH.RUNTIME.TEAM) App.on(TeamModule); // 小队模块
if (MODULE_SWITCH.RUNTIME.RESOURCE_MANAGE) App.on(ResourceManage); // 资源调度管理
if (MODULE_SWITCH.RUNTIME.INTER_SHARD) App.on(InterShardModule); // InterShardMemory 缓存与清理
if (MODULE_SWITCH.RUNTIME.EXPAND) App.on(ExpandModule); // 跨 shard 扩张
if (MODULE_SWITCH.RUNTIME.NUKE) App.on(NukeModule); // 核弹打击
if (MODULE_SWITCH.RUNTIME.DD) App.on(DDModule); // 消息模块
if (MODULE_SWITCH.RUNTIME.CLEAR) App.on(ClearModule); // 过期数据清理
if (MODULE_SWITCH.RUNTIME.STATISTICS) App.on(Statistics); // 统计数据
if (MODULE_SWITCH.RUNTIME.PIXEL) App.on(GeneratePixel); // 搓像素


export const loop = App.run;


// // 性能开销分析
// import profiler from '@/modules/infra/screeps-profiler';
// profiler.enable();
// export const loop = function() {
//     profiler.wrap(App.run);
// }
