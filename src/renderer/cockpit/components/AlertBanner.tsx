import React from 'react'
import type { Alert } from '@shared/state'

interface Props {
  alerts: Alert[]
  onDismiss: (id: string) => void
  onResume?: () => void
}

export function AlertBanner({ alerts, onDismiss, onResume }: Props): React.ReactElement {
  const hasDisplay = alerts.some((a) => a.code === 'DISPLAY_AVAILABLE')

  return (
    <div className="alert-banner">
      {alerts.map((alert) => (
        <div key={alert.id} className={`alert-item ${alert.level}`}>
          <span>{alert.message}</span>
          {alert.code === 'DISPLAY_AVAILABLE' && onResume && (
            <button className="alert-resume-btn" onClick={onResume}>Resume</button>
          )}
          {!alert.sticky && (
            <button className="alert-dismiss" onClick={() => onDismiss(alert.id)} title="Dismiss">✕</button>
          )}
        </div>
      ))}
    </div>
  )
}
