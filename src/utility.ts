import { world, Entity, ScoreboardIdentity, system } from '@minecraft/server';

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
    const objective = world.scoreboard.getObjective(objectiveId);
    if (!objective) throw new Error(`Objective ${objectiveId} not found`);
    objective.setScore(participant, score);
}

export function addScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string, score: number): void {
    const objective = world.scoreboard.getObjective(objectiveId);
    if (!objective) throw new Error(`Objective ${objectiveId} not found`);
    objective.addScore(participant, score);
}

export function subtractScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string, score: number): void {
    const previousScore = getScore(participant, objectiveId);
    setScore(participant, objectiveId, previousScore - score);
}

export function resetScore(participant: Entity | ScoreboardIdentity | string, objectiveId: string): void {
    const objective = world.scoreboard.getObjective(objectiveId);
    if (!objective) throw new Error(`Objective ${objectiveId} not found`);
    objective.removeParticipant(participant);
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
