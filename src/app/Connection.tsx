import { useEffect, useState } from 'react';
import { CheckIcon, CloudOffIcon } from '../ui/icons';
import styles from './Connection.module.css';
import toast from './Toast.module.css';

const BACK_ONLINE_MS = 4000;

/** A pill saying the browser is offline, and what still works. */
export function OfflineChip({
  online,
  detail,
  className,
}: {
  online: boolean;
  detail: string;
  className?: string;
}) {
  if (online) return null;
  return (
    <p role="status" className={`${styles.chip} ${className ?? ''}`}>
      <CloudOffIcon size={16} />
      <span>
        <b>Offline</b> · {detail}
      </span>
    </p>
  );
}

/** A short note when the connection comes back, where the update note shows. */
export function BackOnlineNote({ online }: { online: boolean }) {
  const [wasOffline, setWasOffline] = useState(!online);
  const [shown, setShown] = useState(false);
  if (online === wasOffline) {
    setWasOffline(!online);
    setShown(online);
  }
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div role="status" className={toast.toast}>
      <CheckIcon size={18} className={`${toast.icon} ${styles.ok}`} />
      <span className={toast.text}>Back online. Search and live traffic work again.</span>
    </div>
  );
}
