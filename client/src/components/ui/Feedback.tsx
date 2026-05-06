import type { ReactNode } from "react";
import styles from "./Feedback.module.css";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ text = "Yükleniyor..." }: { text?: string }) {
  return <p className={styles.state}>{text}</p>;
}

export function EmptyState({
  title = "Kayıt bulunamadı",
  text = "Bu filtrelerle rapor verisi bulunamadı.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <p className={styles.error}>{message}</p>;
}

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>;
}
