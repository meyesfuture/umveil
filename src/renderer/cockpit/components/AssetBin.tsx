import React, { useState, useMemo } from 'react'
import type { AppState, ItemView } from '@shared/state'
import type { AppWindowInfo } from '@shared/ipc'

interface Props {
  state: AppState
  onPush: (itemId: string) => void
  onImport: (paths: string[]) => void
  onAddEmbed: (url: string) => void
  onRemove: (itemId: string) => void
  onProjectApp: (sourceId: string) => void
  onListApps: () => Promise<AppWindowInfo[]>
  onPinApp: (sourceId: string) => void
}

type Tab = 'media' | 'web' | 'apps'

export const AssetBin = React.memo(function AssetBin({ state, onPush, onImport, onAddEmbed, onRemove, onProjectApp, onListApps, onPinApp }: Props): React.ReactElement {
  const [tab, setTab] = useState<Tab>('media')
  const [embedUrl, setEmbedUrl] = useState('')
  const [liveWindows, setLiveWindows] = useState<AppWindowInfo[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const { content, pending, session } = state.stage
  const isLive = session === 'live'

  const { mediaItems, webItems, appItems } = useMemo(() => ({
    mediaItems: state.scene.items.filter((i) => i.kind === 'image' || i.kind === 'video'),
    webItems: state.scene.items.filter((i) => i.kind === 'embed'),
    appItems: state.scene.items.filter((i) => i.kind === 'app'),
  }), [state.scene.items])

  function isCurrentItem(item: ItemView): boolean {
    if ('itemId' in content && content.itemId === item.id) return true
    return false
  }
  function isLoadingItem(item: ItemView): boolean {
    return pending?.itemId === item.id
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).map((f) => f.path)
    if (files.length > 0) onImport(files)
  }

  async function refreshApps(): Promise<void> {
    setLoadingApps(true)
    try {
      const windows = await onListApps()
      setLiveWindows(windows)
    } catch {
      setLiveWindows([])
    } finally {
      setLoadingApps(false)
    }
  }

  return (
    <div className="asset-bin">
      <div className="bin-tabs">
        {(['media', 'web', 'apps'] as Tab[]).map((t) => (
          <button key={t} className={`bin-tab${tab === t ? ' active' : ''}`} onClick={() => {
            setTab(t)
            if (t === 'apps') refreshApps()
          }}>
            {t === 'media' ? 'Media' : t === 'web' ? 'Web' : 'Apps'}
          </button>
        ))}
      </div>

      <div className="bin-content" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {tab === 'media' && (
          <>
            {mediaItems.length === 0 && (
              <div style={{ color: '#555', textAlign: 'center', marginTop: 24, fontSize: 13 }}>
                Drop files here or click Import
              </div>
            )}
            {mediaItems.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                isLive={isCurrentItem(item)}
                isLoading={isLoadingItem(item)}
                onClick={() => isLive && onPush(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </>
        )}

        {tab === 'web' && (
          <>
            <div className="embed-input">
              <input
                type="url"
                placeholder="Paste URL…"
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && embedUrl.trim()) {
                    onAddEmbed(embedUrl.trim())
                    setEmbedUrl('')
                  }
                }}
              />
              <button className="btn" onClick={() => { if (embedUrl.trim()) { onAddEmbed(embedUrl.trim()); setEmbedUrl('') } }}>Add</button>
            </div>
            {webItems.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                isLive={isCurrentItem(item)}
                isLoading={isLoadingItem(item)}
                onClick={() => isLive && onPush(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </>
        )}

        {tab === 'apps' && (
          <>
            {/* Pinned app targets */}
            {appItems.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#888', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pinned targets</div>
                {appItems.map((item) => (
                  <AppItemTile
                    key={item.id}
                    item={item as ItemView & { kind: 'app' }}
                    isLive={isCurrentItem(item)}
                    onClick={() => isLive && onPush(item.id)}
                    onRemove={() => onRemove(item.id)}
                  />
                ))}
              </div>
            )}

            {/* Live window switcher */}
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' }}>
              <span>Live windows</span>
              <button className="btn" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 8 }}
                onClick={refreshApps} title="Refresh window list">
                {loadingApps ? '…' : '↻'}
              </button>
            </div>
            {liveWindows.length === 0 && !loadingApps && (
              <div style={{ color: '#555', fontSize: 12, marginTop: 8 }}>
                No windows found. Click ↻ to refresh.
              </div>
            )}
            {liveWindows.map((win) => (
              <div key={win.sourceId} className="item-tile" style={{ cursor: 'default' }}>
                {win.thumbDataUrl && (
                  <img className="item-thumb" src={win.thumbDataUrl} alt="" style={{ objectFit: 'cover' }} />
                )}
                <div className="item-info">
                  <div className="item-name" title={win.title}>{win.title || win.processName || win.sourceId}</div>
                  {win.processName && <div className="item-meta">{win.processName}</div>}
                  {win.minimized && <div className="item-meta" style={{ color: '#ffd166' }}>minimized</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {isLive && (
                    <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => onProjectApp(win.sourceId)} title="Mirror now">
                      ▶
                    </button>
                  )}
                  <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={() => onPinApp(win.sourceId)} title="Pin as target">
                    📌
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="bin-actions">
        {tab === 'media' && (
          <button className="btn" style={{ flex: 1 }}
            onClick={() => {
              // Trigger file picker via IPC
              window.umveil.invoke('items:import-dialog')
            }}>Import…</button>
        )}
      </div>
    </div>
  )
})

const ItemTile = React.memo(function ItemTile({
  item, isLive, isLoading, onClick, onRemove,
}: {
  item: ItemView
  isLive: boolean
  isLoading: boolean
  onClick: () => void
  onRemove: () => void
}): React.ReactElement {
  const statusClass = isLive ? 'live' : isLoading ? 'loading' : item.status === 'error' ? 'error' : ''

  const thumbUrl = 'thumbUrl' in item ? item.thumbUrl : undefined

  return (
    <div className={`item-tile${isLive ? ' live' : isLoading ? ' loading' : item.status === 'error' ? ' error' : ''}`}
      onClick={onClick}>
      {thumbUrl && <img className="item-thumb" src={thumbUrl} alt="" />}
      {!thumbUrl && (
        <div className="item-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          {item.kind === 'embed' ? '🌐' : '📦'}
        </div>
      )}
      <div className="item-info">
        <div className="item-name">{item.name}</div>
        <div className="item-meta">
          {item.kind === 'video' && `Video`}
          {item.kind === 'image' && `Image`}
          {item.kind === 'embed' && `Web`}
        </div>
      </div>
      {statusClass && (
        <span className={`item-status ${statusClass}`}>
          {isLive ? 'LIVE' : isLoading ? '…' : item.status === 'error' ? 'ERR' : ''}
        </span>
      )}
      <button
        className="btn"
        style={{ padding: '2px 6px', fontSize: 11, marginLeft: 4 }}
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        title="Remove">
        ✕
      </button>
    </div>
  )
})

const AppItemTile = React.memo(function AppItemTile({
  item, isLive, onClick, onRemove,
}: {
  item: ItemView & { kind: 'app' }
  isLive: boolean
  onClick: () => void
  onRemove: () => void
}): React.ReactElement {
  return (
    <div className={`item-tile${isLive ? ' live' : ''}`} onClick={onClick}>
      <div className="item-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>🖥</div>
      <div className="item-info">
        <div className="item-name">{item.name}</div>
        <div className="item-meta">{item.match.processName}{!item.running ? ' · not running' : ''}</div>
      </div>
      <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }}
        onClick={(e) => { e.stopPropagation(); onRemove() }} title="Remove">✕</button>
    </div>
  )
})
