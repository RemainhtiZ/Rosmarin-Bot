export const SEASON8_SCORE_BY_LEVEL: Record<number, number> = {
    1: 1,
    2: 4,
    3: 9,
    4: 16,
    5: 25,
};

const ROOM_NAME_REG = /^([WE])(\d+)([NS])(\d+)$/;

type ParsedRoomCoord = {
    ew: 'E' | 'W';
    x: number;
    ns: 'N' | 'S';
    y: number;
};

export const parseRoomCoord = (roomName: string): ParsedRoomCoord | null => {
    const match = ROOM_NAME_REG.exec(String(roomName || ''));
    if (!match) return null;
    return {
        ew: match[1] as 'E' | 'W',
        x: Number(match[2]),
        ns: match[3] as 'N' | 'S',
        y: Number(match[4]),
    };
};

export const getSeason8SectorLevel = (roomName: string): 0 | 1 | 2 | 3 | 4 | 5 => {
    const coord = parseRoomCoord(roomName);
    if (!coord) return 0;
    if (coord.ns !== 'N') return 0;
    const n = coord.y;
    if (n >= 81 && n <= 99) return 5;
    if (n >= 61 && n <= 79) return 4;
    if (n >= 41 && n <= 59) return 3;
    if (n >= 21 && n <= 39) return 2;
    if (n >= 1 && n <= 19) return 1;
    return 0;
};

export const getSeason8TickScore = (roomName: string): number => {
    const level = getSeason8SectorLevel(roomName);
    if (!level) return 0;
    return SEASON8_SCORE_BY_LEVEL[level] || 0;
};

export const estimateSeason8TargetPriority = (homeRoom: string, targetRoom: string): number => {
    const score = getSeason8TickScore(targetRoom);
    if (score <= 0) return 0;
    const distance = Math.max(1, Game.map.getRoomLinearDistance(homeRoom, targetRoom, true));
    const visible = Game.rooms[targetRoom];
    const myUsername = Object.values(Game.rooms)
        .find((room) => room?.controller?.my)
        ?.controller?.owner?.username;
    const hostilePenalty = visible?.controller && !visible.controller.my && visible.controller.owner ? 6 : 0;
    const reservePenalty = visible?.controller?.reservation &&
        visible.controller.reservation.username !== myUsername ? 2 : 0;
    return score * 100 - distance * 10 - hostilePenalty - reservePenalty;
};

export const roomNameHash = (roomName: string): number => {
    let hash = 0;
    const text = String(roomName || '');
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 131 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
};
