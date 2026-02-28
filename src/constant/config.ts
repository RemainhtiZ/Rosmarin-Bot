import {RESOURCE_ABBREVIATIONS} from './ResourceConstant'

export const VERSION = '1.16.1';

/**
 * 基础配置
 */
export const BASE_CONFIG = {
    // bot名称
    BOT_NAME: 'Rosmarin',
    // 默认签名
    DEFAULT_SIGN: ``,
    // 长名资源缩写
    RESOURCE_ABBREVIATIONS,
}

export const OUTMINE_CONFIG = {
    // 过道观察间隔
    LOOK_INTERVAL: 10,
    // 沉积物最大冷却
    DEPOSIT_MAX_COOLDOWN: 120,
    // Power采集最小数量
    POWER_MIN_AMOUNT: 3000,
}

/**
 * 全局模块开关（按大模块控制，避免过细粒度）
 * season 场景常见配置示例：
 * - 保留房间运营 + Lab：ROOM.LAB=true
 * - 关闭商品生产：ROOM.FACTORY=false
 * - 关闭过道采集（power/deposit）：ROOM.HIGHWAY_MINE=false
 */
export const MODULE_SWITCH = {
    RUNNER: {
        ROOM: true,
        CREEP: true,
        POWER_CREEP: true,
        FLAG: true,
    },
    RUNTIME: {
        TEAM: true,
        RESOURCE_MANAGE: true,
        INTER_SHARD: true,
        EXPAND: true,
        NUKE: true,
        DD: true,
        CLEAR: true,
        STATISTICS: true,
        PIXEL: true,
    },
    ROOM: {
        DEFENSE: true,
        AUTO_MARKET: true,
        AUTO_BUILD: true,
        LAB: true,          // LabWork + autoLab
        FACTORY: true,      // FactoryWork + autoFactory（商品生产）
        POWER_SPAWN: true,  // PowerSpawnWork + autoPower
        OUTMINE: true,      // 外矿（energy/center）
        HIGHWAY_MINE: true, // 过道 power/deposit 采集
    },
} as const;

/**
 * 外矿道路配置
 */
export const EXTERNAL_ROAD_CONFIG = {
    // ============================================================
    // 路径计算配置
    // ============================================================
    
    /** 道路代价 */
    ROAD_COST: 1,
    /** 平地代价 */
    PLAIN_COST: 2,
    /** 沼泽代价 */
    SWAMP_COST: 4,
    /** PathFinder 最大操作数 */
    MAX_OPS: 5000,
    
    // ============================================================
    // 缓存配置
    // ============================================================
    
    /** CostMatrix 缓存 TTL (ticks) */
    COST_MATRIX_TTL: 100,
    /** 路径缓存 TTL (ticks) */
    PATH_CACHE_TTL: 1,
    
    // ============================================================
    // 建造配置
    // ============================================================
    
    /** 道路建造间隔 (ticks) */
    BUILD_INTERVAL: 500,
    /** 单路线最大建造工地数 */
    MAX_SITES_PER_ROUTE: 10,
    /** 能量矿道路建造最低房间等级 */
    ENERGY_ROAD_MIN_LEVEL: 4,
    /** 中央九房道路建造最低房间等级 */
    CENTER_ROAD_MIN_LEVEL: 6,
    
    // ============================================================
    // 维护配置
    // ============================================================
    
    /** 道路健康检查间隔 (ticks) */
    HEALTH_CHECK_INTERVAL: 500,
    /** 道路维护执行间隔 (ticks) */
    MAINTAIN_INTERVAL: 500,
    /** 道路修复阈值 (hits 百分比) */
    REPAIR_THRESHOLD: 0.5,
    /** 道路严重损坏阈值 (hits 百分比) */
    CRITICAL_THRESHOLD: 0.2,
    
    // ============================================================
    // CPU 保护配置
    // ============================================================
    
    /** CPU 保护阈值 (已用 CPU 占 tickLimit 百分比) */
    CPU_THRESHOLD: 0.9,
    /** 单 tick 最大计算路径数 */
    MAX_PATHS_PER_TICK: 0,  // 0 表示不限制
    
    // ============================================================
    // 数据格式版本
    // ============================================================
    
    /** 当前数据格式版本 */
    DATA_VERSION: 1,
}
