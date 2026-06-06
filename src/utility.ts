import { world, Entity, ScoreboardIdentity, system, Player } from '@minecraft/server';

export function getScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string): number {
    try {
        const objective = world.scoreboard.getObjective(objectiveId);
        if (!objective) return 0;
        return objective.getScore(participant) ?? 0;
    } catch {
        return 0;
    }
}

export function setScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string, score: number): void {
    try {
        const objective = world.scoreboard.getObjective(objectiveId);
        if (!objective) return;
        objective.setScore(participant, score);
    } catch (err) {
        try {
            if (participant instanceof Player) {
                participant.runCommand(`scoreboard players set @s ${objectiveId} ${score}`);
            } else if (typeof participant === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players set "${participant}" ${objectiveId} ${score}`);
            } else if (typeof (participant as any).name === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players set "${(participant as any).name}" ${objectiveId} ${score}`);
            }
        } catch (cmdErr) {
            console.warn(`[Shop Scoreboard] Failed to set score for ${objectiveId}: ${cmdErr}`);
        }
    }
}

export function addScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string, score: number): void {
    try {
        const objective = world.scoreboard.getObjective(objectiveId);
        if (!objective) return;
        objective.addScore(participant, score);
    } catch (err) {
        try {
            if (participant instanceof Player) {
                participant.runCommand(`scoreboard players add @s ${objectiveId} ${score}`);
            } else if (typeof participant === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players add "${participant}" ${objectiveId} ${score}`);
            } else if (typeof (participant as any).name === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players add "${(participant as any).name}" ${objectiveId} ${score}`);
            }
        } catch (cmdErr) {
            console.warn(`[Shop Scoreboard] Failed to add score for ${objectiveId}: ${cmdErr}`);
        }
    }
}

export function subtractScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string, score: number): void {
    try {
        const objective = world.scoreboard.getObjective(objectiveId);
        if (!objective) return;
        try {
            const previousScore = objective.getScore(participant) ?? 0;
            objective.setScore(participant, previousScore - score);
        } catch {
            if (participant instanceof Player) {
                participant.runCommand(`scoreboard players remove @s ${objectiveId} ${score}`);
            } else if (typeof participant === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players remove "${participant}" ${objectiveId} ${score}`);
            } else if (typeof (participant as any).name === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players remove "${(participant as any).name}" ${objectiveId} ${score}`);
            }
        }
    } catch (err) {
        console.warn(`[Shop Scoreboard] Failed to subtract score for ${objectiveId}: ${err}`);
    }
}

export function resetScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string): void {
    try {
        const objective = world.scoreboard.getObjective(objectiveId);
        if (!objective) return;
        objective.removeParticipant(participant);
    } catch (err) {
        try {
            if (participant instanceof Player) {
                participant.runCommand(`scoreboard players reset @s ${objectiveId}`);
            } else if (typeof participant === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players reset "${participant}" ${objectiveId}`);
            } else if (typeof (participant as any).name === 'string') {
                world.getDimension('overworld').runCommand(`scoreboard players reset "${(participant as any).name}" ${objectiveId}`);
            }
        } catch (cmdErr) {
            // Ignore
        }
    }
}


/**
 * Replaces the CPU-heavy busy-wait loop with a native, non-blocking system timer.
 * 1 second = 20 ticks.
 */
export function setTimeout(callback: () => void, delayMs: number): number {
    const ticks = Math.max(1, Math.round(delayMs / 50));
    return system.runTimeout(callback, ticks);
}

export function iName(str: string): string {
    if (!str) return "Unknown Item";
    const parts = str.split(':');
    let name = parts[1] || parts[0];
    name = name.replace(/_/g, ' ');
    return name.replace(/\b\w/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

export function encode(str: string): string {
    return str.split('').map((char) => '§' + char).join('');
}

export function romanize(num: number): string {
    if (num > 10) return 'X';
    const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return romanNumerals[num] || num.toString();
}

export function displayFormat(input: string): string {
    const words = input.split(/(?=[A-Z])/);
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
