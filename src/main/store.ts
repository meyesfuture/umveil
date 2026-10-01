/**
 * store.ts — Main-process state store.
 * Holds AppState, applies actions via the pure reducer, broadcasts snapshots.
 * INV-5: single source of truth.
 */
import { appReducer, INITIAL_STATE } from '@shared/state'
import type { AppState, AppAction } from '@shared/state'
import { logger } from './services/logger'

type SnapshotListener = (state: AppState) => void

class Store {
  private state: AppState = { ...INITIAL_STATE }
  private listeners = new Set<SnapshotListener>()

  getState(): AppState {
    return this.state
  }

  dispatch(action: AppAction): AppState {
    const prev = this.state
    this.state = appReducer(prev, action)
    if (this.state !== prev) {
      logger.debug('store.dispatch', { type: action.type, revision: this.state.revision })
      this.broadcast()
    }
    return this.state
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private broadcast(): void {
    const snapshot = this.state
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (e) {
        logger.error('store.broadcast.error', { error: String(e) })
      }
    }
  }
}

export const store = new Store()
