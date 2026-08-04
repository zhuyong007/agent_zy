import { useEffect, useRef } from "react";

export function HistoryErrorNotice(props: {
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}) {
  const onDismissRef = useRef(props.onDismiss);

  useEffect(() => {
    onDismissRef.current = props.onDismiss;
  }, [props.onDismiss]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDismissRef.current(), props.autoDismissMs ?? 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [props.autoDismissMs, props.message]);

  return (
    <div className="news-error history-error-notice" role="alert">
      <span>{props.message}</span>
      <button type="button" aria-label={props.dismissLabel} onClick={props.onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
