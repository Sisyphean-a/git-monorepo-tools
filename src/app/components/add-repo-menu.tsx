import { FolderPlus, Plus, Tags, X } from 'lucide-react';
import { C } from '../theme';

interface AddRepoMenuProps {
  open: boolean;
  onClose: () => void;
  onAddFolder: () => void;
  onAddCategory: () => void;
}

function ActionButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        background: C.panel2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ color: C.btnPrimary, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{title}</div>
        <div style={{ color: C.textWeak, fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{description}</div>
      </div>
    </button>
  );
}

export function AddRepoMenu({ open, onClose, onAddFolder, onAddCategory }: AddRepoMenuProps) {
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
      <div
        style={{
          position: 'fixed',
          top: 70,
          left: 18,
          width: 320,
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          zIndex: 31,
          boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600 }}>新增入口</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionButton
            icon={<FolderPlus size={14} />}
            title="添加文件夹"
            description="通过本机目录选择器加入新的扫描目录，并在下次扫描时发现真实仓库。"
            onClick={onAddFolder}
          />
          <ActionButton
            icon={<Tags size={14} />}
            title="添加分类"
            description="创建新的仓库分类名称，后续新增目录时可挂到该分类下。"
            onClick={onAddCategory}
          />
          <ActionButton
            icon={<Plus size={14} />}
            title="添加仓库"
            description="当前浏览器版通过添加扫描目录纳入真实仓库，不使用 mock 数据。"
            onClick={onAddFolder}
          />
        </div>
      </div>
    </>
  );
}
