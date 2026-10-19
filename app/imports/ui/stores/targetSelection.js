import { defineStore } from 'pinia';

/*
 * What the target picker preselects (Q1 of the monsters' phase 2): the last
 * targets of each action, and the creature "Target" picks on a party board
 * (PartyMemberCard), whichever is newer. Kept in this browser only, a
 * convenience: another device starts with none.
 */

const STORAGE_KEY = 'dicecloud.targetSelection';
// The actions whose last targets are kept: the most recently used
const MAX_REMEMBERED = 200;

function stored() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      last: value && typeof value.last === 'object' ? value.last : {},
      board: value && typeof value.board === 'object' ? value.board : {},
    };
  } catch {
    return { last: {}, board: {} };
  }
}

export const useTargetSelectionStore = defineStore('targetSelection', {
  state: () => stored(),
  getters: {
    /** The creatures "Target" picked on a party's board */
    boardTargets: state => folderId => state.board[folderId]?.ids || [],
  },
  actions: {
    // Another tab of the board may have picked since
    refresh() {
      const { last, board } = stored();
      this.last = last;
      this.board = board;
    },
    save() {
      const entries = Object.entries(this.last);
      if (entries.length > MAX_REMEMBERED) {
        entries.sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
        this.last = Object.fromEntries(entries.slice(0, MAX_REMEMBERED));
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ last: this.last, board: this.board }));
      } catch {
        // Private window, storage full: the preselection lasts until the page closes
      }
    },
    /** The targets an action was last applied to; none is a choice too */
    remember(propId, targetIds = []) {
      if (!propId) return;
      this.refresh();
      this.last[propId] = { ids: [...targetIds], at: Date.now() };
      this.save();
    },
    /** "Target" on a board's card: that creature, or none once picked again */
    toggleBoardTarget(folderId, creatureId) {
      this.refresh();
      const picked = this.board[folderId]?.ids?.includes(creatureId);
      if (picked) delete this.board[folderId];
      else this.board[folderId] = { ids: [creatureId], at: Date.now() };
      this.save();
    },
    /**
     * What the picker starts with: the newer of the action's last targets
     * and its parties' boards' pick, among those it may target; one at most
     * for a single target
     * @param {{ propId?: string, folderIds?: string[], candidateIds?: string[], single?: boolean }} options
     */
    preselection({ propId, folderIds = [], candidateIds = [], single = false }) {
      this.refresh();
      const last = propId ? this.last[propId] : undefined;
      const board = folderIds.map(id => this.board[id]).filter(Boolean)
        .sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      const source = board && (!last || (board.at || 0) > (last.at || 0)) ? board : last;
      const ids = (source?.ids || []).filter(id => candidateIds.includes(id));
      return single ? ids.slice(0, 1) : ids;
    },
  },
});
