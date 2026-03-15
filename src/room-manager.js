/**
 * Manages the persistent room graph.
 * Rooms are never deleted. NPC chat histories survive room transitions.
 */
export class RoomManager {
  constructor() {
    this.rooms = new Map();   // id -> { def, npcHistories: Map<npcName, history[]> }
    this.edges = [];          // { fromId, toId, fromWallX, toWallX }
    this.currentRoomId = null;
    this._nextId = 0;
  }

  /** Call once at startup for the bedroom. */
  initStartRoom() {
    const id = this._nextId++;
    this.rooms.set(id, {
      def: { name: 'Your Bedroom', isStart: true },
      npcHistories: new Map()
    });
    this.currentRoomId = id;
    return id;
  }

  /**
   * Add a fully-generated room connected to fromRoomId.
   * Returns the new room's id.
   */
  addRoom(worldDef, fromRoomId) {
    const id = this._nextId++;
    this.rooms.set(id, { def: worldDef, npcHistories: new Map() });

    const slot = this.edges.filter(e => e.fromId === fromRoomId).length;
    const fromWallX = this._childSlotToX(slot);
    const toWallX = -3.5; // return tunnel is always on the left

    this.edges.push({ fromId: fromRoomId, toId: id, fromWallX, toWallX });
    return id;
  }

  getRoom(id) { return this.rooms.get(id); }

  /**
   * Returns all tunnel connections for a room.
   * Each entry: { neighborId, wallX }
   */
  getConnections(roomId) {
    return this.edges.flatMap(e => {
      if (e.fromId === roomId) return [{ neighborId: e.toId,   wallX: e.fromWallX }];
      if (e.toId   === roomId) return [{ neighborId: e.fromId, wallX: e.toWallX   }];
      return [];
    });
  }

  getNPCHistory(roomId, npcName) {
    return this.rooms.get(roomId)?.npcHistories.get(npcName) ?? [];
  }

  setNPCHistory(roomId, npcName, history) {
    this.rooms.get(roomId)?.npcHistories.set(npcName, history);
  }

  // x positions for child tunnels (slot 0, 1, 2 …)
  _childSlotToX(slot) {
    return [0, 2.5, 5.0, -1.5, -4.0][Math.min(slot, 4)];
  }
}
