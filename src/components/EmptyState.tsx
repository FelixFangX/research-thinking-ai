interface Props {
  icon?: string
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon = '🔬', title, description, action }: Props) {
  return (
    <div className="empty-state animate-in" role="status">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {action ? (
        <button className="btn btn-primary" onClick={action.onClick} type="button">
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
