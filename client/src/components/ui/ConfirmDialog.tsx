import styles from "../../pages/dataPage.module.css";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div className={styles.modal} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>{message}</p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.dangerBtn : styles.primary}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "İşleniyor..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
