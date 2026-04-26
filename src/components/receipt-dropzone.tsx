'use client';

/**
 * 領収証アップロード Dropzone（W2-B 本実装）
 *
 * フロー:
 *  1. ファイル選択 (drag&drop or input click)
 *  2. クライアント側で MIME / size 検証
 *  3. POST /api/upload-url で R2 PUT 署名 URL 取得
 *  4. XHR PUT で R2 直アップロード（onUploadProgress で進捗バー）
 *  5. 成功時 onUploaded({ objectKey, fileName, size, contentType })
 *
 * Props:
 *  - onUploaded:        添付メタを親に通知（フォームの hidden state へ書き込む想定）
 *  - maxFiles?:         最大ファイル数（デフォルト 5）
 *  - className?:        追加クラス
 */
import * as React from 'react';
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils/cn';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

const ACCEPT_MIME = ALLOWED_TYPES.join(', ');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_BYTES_LABEL = '10MB';

export type UploadedAttachment = {
  objectKey: string;
  fileName: string;
  size: number;
  contentType: AllowedType;
};

type LocalFile = {
  id: string;
  file: File;
  progress: number; // 0-100
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  result?: UploadedAttachment;
};

export type ReceiptDropzoneProps = {
  onUploaded: (attachment: UploadedAttachment) => void;
  maxFiles?: number;
  className?: string;
  /** 既存件数（上限算出に使う） */
  existingCount?: number;
};

function isAllowedType(t: string): t is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(t);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function requestUploadUrl(
  file: File,
): Promise<{ uploadUrl: string; key: string }> {
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(body.message ?? body.error ?? `署名URL取得に失敗 (${res.status})`);
  }
  return (await res.json()) as { uploadUrl: string; key: string };
}

function uploadToR2(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('content-type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 へのアップロード失敗 (${xhr.status})`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          'ネットワークエラー。CORS または R2 バケット設定を確認してください',
        ),
      );
    xhr.send(file);
  });
}

export function ReceiptDropzone({
  onUploaded,
  maxFiles = 5,
  className,
  existingCount = 0,
}: ReceiptDropzoneProps) {
  const [files, setFiles] = React.useState<LocalFile[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const remainingSlots = Math.max(
    0,
    maxFiles - existingCount - files.filter((f) => f.status !== 'error').length,
  );

  const validateAndQueue = React.useCallback(
    (selected: File[]) => {
      setGlobalError(null);
      const accepted: LocalFile[] = [];
      let availableSlots = remainingSlots;
      for (const file of selected) {
        if (availableSlots <= 0) {
          setGlobalError(
            `添付できるファイルは ${maxFiles} 件までです`,
          );
          break;
        }
        if (!isAllowedType(file.type)) {
          accepted.push({
            id: crypto.randomUUID(),
            file,
            progress: 0,
            status: 'error',
            error: `${file.name}: 未対応のファイル形式`,
          });
          continue;
        }
        if (file.size > MAX_BYTES) {
          accepted.push({
            id: crypto.randomUUID(),
            file,
            progress: 0,
            status: 'error',
            error: `${file.name}: ${MAX_BYTES_LABEL} を超えています`,
          });
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          progress: 0,
          status: 'queued',
        });
        availableSlots -= 1;
      }
      setFiles((prev) => [...prev, ...accepted]);
    },
    [remainingSlots, maxFiles],
  );

  // queued → uploading → done のループを副作用で実行
  React.useEffect(() => {
    const target = files.find((f) => f.status === 'queued');
    if (!target) return;

    let cancelled = false;
    (async () => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id
            ? { ...f, status: 'uploading', progress: 0 }
            : f,
        ),
      );
      try {
        const { uploadUrl, key } = await requestUploadUrl(target.file);
        await uploadToR2(uploadUrl, target.file, (pct) => {
          if (cancelled) return;
          setFiles((prev) =>
            prev.map((f) =>
              f.id === target.id ? { ...f, progress: pct } : f,
            ),
          );
        });
        if (cancelled) return;

        const attachment: UploadedAttachment = {
          objectKey: key,
          fileName: target.file.name,
          size: target.file.size,
          contentType: target.file.type as AllowedType,
        };
        setFiles((prev) =>
          prev.map((f) =>
            f.id === target.id
              ? { ...f, status: 'done', progress: 100, result: attachment }
              : f,
          ),
        );
        onUploaded(attachment);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'アップロード失敗';
        setFiles((prev) =>
          prev.map((f) =>
            f.id === target.id ? { ...f, status: 'error', error: msg } : f,
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files, onUploaded]);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) validateAndQueue(dropped);
  };

  const onPickFiles: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const list = e.target.files;
    if (list) validateAndQueue(Array.from(list));
    // 同じファイル再選択を許可するため reset
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex h-40 cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed bg-stone-100/40 p-6 text-center transition-colors',
          isDragOver
            ? 'border-court-green bg-court-green/5'
            : 'border-border hover:border-court-green',
        )}
        aria-label="領収証ファイルを選択またはドラッグ＆ドロップ"
      >
        <ArrowUpTrayIcon
          className="mb-2 h-6 w-6 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground">
          領収証をドラッグ＆ドロップ、またはクリックで選択
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPEG / PNG / WebP / HEIC / PDF（最大 {MAX_BYTES_LABEL}・最大{' '}
          {maxFiles}件）
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_MIME}
          onChange={onPickFiles}
          className="sr-only"
          aria-hidden="true"
        />
      </div>

      {globalError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          <ExclamationTriangleIcon
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{globalError}</span>
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {f.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(f.file.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {f.status === 'done' && (
                    <CheckCircleIcon
                      className="h-5 w-5 text-court-green"
                      aria-label="アップロード完了"
                    />
                  )}
                  {f.status === 'error' && (
                    <ExclamationTriangleIcon
                      className="h-5 w-5 text-danger"
                      aria-label="エラー"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-stone-100 hover:text-foreground"
                    aria-label={`${f.file.name} を削除`}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {(f.status === 'uploading' || f.status === 'queued') && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full bg-court-green transition-[width] duration-200"
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              )}
              {f.status === 'error' && f.error && (
                <p className="mt-2 text-xs text-danger">{f.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
