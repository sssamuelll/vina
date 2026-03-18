import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setConfirmOverride } from '../../store/workflowSlice';

interface Props {
  operationName: string;
  position: { top: number; left: number };
  onClose: () => void;
}

// Map tool IDs to their destructive operation names
const TOOL_TO_OPERATION: Record<string, string> = {
  scissors: 'splitPiece',
  merge: 'mergePieces',
};

const POLICIES = [
  { value: 'default', label: 'Follow Expert Mode' },
  { value: 'always', label: 'Always Confirm' },
  { value: 'never', label: 'Never Confirm' },
] as const;

export default function ToolButtonContextMenu({ operationName, position, onClose }: Props) {
  const dispatch = useDispatch();
  const resolvedOp = TOOL_TO_OPERATION[operationName] ?? operationName;
  const current = useSelector(
    (s: RootState) => s.workflow.confirmOverrides[resolvedOp] ?? 'default'
  );

  const handleSelect = (policy: 'default' | 'always' | 'never') => {
    dispatch(setConfirmOverride({ operation: resolvedOp, value: policy }));
    onClose();
  };

  return (
    <div
      className="tool-context-menu"
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
    >
      <div className="tool-context-menu-title">Confirmation</div>
      {POLICIES.map(p => (
        <button
          key={p.value}
          className={`tool-context-menu-item ${current === p.value ? 'active' : ''}`}
          onClick={() => handleSelect(p.value)}
        >
          {p.label}
          {current === p.value && ' ✓'}
        </button>
      ))}
    </div>
  );
}
