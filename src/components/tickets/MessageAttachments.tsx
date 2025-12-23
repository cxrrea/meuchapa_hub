import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Paperclip, X, FileText, Image, Download, Loader2 } from 'lucide-react';

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
}

interface MessageAttachmentsProps {
  ticketId: string;
  messageId?: string;
  attachments: Attachment[];
  onUploadComplete?: () => void;
  canUpload?: boolean;
}

export function MessageAttachments({ 
  ticketId, 
  messageId, 
  attachments, 
  onUploadComplete,
  canUpload = true 
}: MessageAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (userId: string) => {
    if (pendingFiles.length === 0) return [];

    setUploading(true);
    const uploadedAttachments: { file_name: string; file_url: string; file_type: string; file_size: number }[] = [];

    try {
      for (const file of pendingFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${ticketId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('attachments')
          .upload(fileName, file);

        if (error) {
          console.error('Upload error:', error);
          toast.error(`Erro ao enviar ${file.name}`);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(fileName);

        // Insert attachment record
        const { error: dbError } = await supabase
          .from('ticket_attachments')
          .insert({
            ticket_id: ticketId,
            message_id: messageId || null,
            uploaded_by: userId,
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.type,
            file_size: file.size,
          });

        if (dbError) {
          console.error('DB error:', dbError);
        } else {
          uploadedAttachments.push({
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.type,
            file_size: file.size,
          });
        }
      }

      setPendingFiles([]);
      onUploadComplete?.();
      
      if (uploadedAttachments.length > 0) {
        toast.success(`${uploadedAttachments.length} arquivo(s) enviado(s)`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Erro ao enviar arquivos');
    } finally {
      setUploading(false);
    }

    return uploadedAttachments;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const isImage = (type: string | null) => type?.startsWith('image/');

  return (
    <div className="space-y-2">
      {/* Display existing attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2 text-sm"
            >
              {isImage(att.file_type) ? (
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-[200px]"
                >
                  <img
                    src={att.file_url}
                    alt={att.file_name}
                    className="rounded max-h-32 object-cover"
                  />
                </a>
              ) : (
                <div className="flex items-center gap-2">
                  {getFileIcon(att.file_type)}
                  <span className="truncate max-w-[150px]">{att.file_name}</span>
                </div>
              )}
              <a
                href={att.file_url}
                download={att.file_name}
                className="p-1 hover:bg-secondary rounded"
              >
                <Download className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-primary/10 rounded-lg px-2 py-1 text-sm"
            >
              {getFileIcon(file.type)}
              <span className="truncate max-w-[150px]">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <button
                onClick={() => removePendingFile(index)}
                className="p-0.5 hover:bg-destructive/20 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {canUpload && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}

export { type Attachment };
