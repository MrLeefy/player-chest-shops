import { world } from "@minecraft/server";

const MAX_PROPERTY_SIZE = 32000;

class DynamicPropertyDatabase {
    #prefix: string;
    #indexId: string;
    #indexCache: Record<string, string | string[]> | null = null;

    constructor(name: string) {
        if (!name || typeof name !== 'string') {
            throw new Error("Database name must be a non-empty string.");
        }
        this.#prefix = `db:${name}:`;
        this.#indexId = `${this.#prefix}__index__`;
    }

    #getIndex(): Record<string, string | string[]> {
        if (this.#indexCache) {
            return this.#indexCache;
        }
        try {
            const rawIndex = world.getDynamicProperty(this.#indexId);
            this.#indexCache = typeof rawIndex === 'string' ? JSON.parse(rawIndex) : {};
            return this.#indexCache || {};
        } catch (e) {
            return {};
        }
    }

    #setIndex(index: Record<string, string | string[]>): void {
        this.#indexCache = index;
        world.setDynamicProperty(this.#indexId, JSON.stringify(index));
    }

    #clearProperties(key: string): void {
        const index = this.#getIndex();
        const propIds = index[key];
        if (!propIds) return;

        if (Array.isArray(propIds)) {
            for (const chunkId of propIds) {
                world.setDynamicProperty(chunkId, undefined);
            }
        } else if (typeof propIds === 'string') {
            world.setDynamicProperty(propIds, undefined);
        }
    }

    set(key: string, value: any): this {
        const index = this.#getIndex();
        this.#clearProperties(key);

        const serializedValue = JSON.stringify(value);

        if (serializedValue.length > MAX_PROPERTY_SIZE) {
            const chunks: string[] = [];
            const propIds: string[] = [];
            for (let i = 0; i < serializedValue.length; i += MAX_PROPERTY_SIZE) {
                chunks.push(serializedValue.substring(i, i + MAX_PROPERTY_SIZE));
            }

            chunks.forEach((chunk, i) => {
                const chunkId = `${this.#prefix}${key}_chunk_${i}`;
                world.setDynamicProperty(chunkId, chunk);
                propIds.push(chunkId);
            });
            index[key] = propIds;
        } else {
            const propId = `${this.#prefix}${key}`;
            world.setDynamicProperty(propId, serializedValue);
            index[key] = propId;
        }

        this.#setIndex(index);
        return this;
    }

    get(key: string): any {
        const index = this.#getIndex();
        const propIds = index[key];

        if (!propIds) {
            return undefined;
        }

        try {
            if (Array.isArray(propIds)) {
                const chunks = propIds.map(chunkId => world.getDynamicProperty(chunkId));
                return JSON.parse(chunks.join(''));
            } else if (typeof propIds === 'string') {
                const rawVal = world.getDynamicProperty(propIds);
                return typeof rawVal === 'string' ? JSON.parse(rawVal) : undefined;
            }
        } catch (e) {
            console.warn(`[Database] Failed to get or parse value for key "${key}":`, e);
            return undefined;
        }
    }

    delete(key: string): boolean {
        const index = this.#getIndex();
        if (!index.hasOwnProperty(key)) {
            return false;
        }
        this.#clearProperties(key);
        delete index[key];
        this.#setIndex(index);
        return true;
    }

    has(key: string): boolean {
        const index = this.#getIndex();
        return index.hasOwnProperty(key);
    }

    clear(): void {
        const index = this.#getIndex();
        for (const key in index) {
            this.#clearProperties(key);
        }
        this.#setIndex({});
    }

    keys(): string[] {
        return Object.keys(this.#getIndex());
    }

    values(): any[] {
        return this.keys().map(key => this.get(key));
    }

    entries(): [string, any][] {
        return this.keys().map(key => [key, this.get(key)]);
    }

    forEach(callback: (value: any, key: string) => void): void {
        for (const [key, value] of this.entries()) {
            callback(value, key);
        }
    }
}

export interface DatabaseSetEvent {
    key: string;
    value: any;
}

export class Database {
    #onSetCallback: ((event: DatabaseSetEvent) => void)[] = [];
    Database: DynamicPropertyDatabase;

    constructor(name: string) {
        this.Database = new DynamicPropertyDatabase(name);
    }

    get length(): number {
        return this.Database.keys().length;
    }

    get(key: string): any {
        return this.Database.get(key);
    }

    set(key: string, value: any): any {
        this.#onSetCallback.forEach(callback => callback({ key, value }));
        return this.Database.set(key, value);
    }

    has(key: string): boolean {
        return this.Database.has(key);
    }

    delete(key: string): boolean {
        return this.Database.delete(key);
    }

    clear(): void {
        this.Database.clear();
    }

    keys(): string[] {
        return this.Database.keys();
    }

    values(): any[] {
        return this.Database.values();
    }

    entries(): [string, any][] {
        return this.Database.entries();
    }

    forEach(callback: (value: any, key: string) => void): void {
        this.Database.forEach((value, key) => callback(value, key));
    }

    onSet = {
        subscribe: (callback: (event: DatabaseSetEvent) => void) => {
            this.#onSetCallback.push(callback);
            return { callback };
        },
        unsubscribe: (listener: { callback: (event: DatabaseSetEvent) => void }) => {
            const index = this.#onSetCallback.indexOf(listener.callback);
            if (index !== -1) {
                this.#onSetCallback.splice(index, 1);
            }
        }
    };
}
