export default function StatusHistoryDrawer({ flightId, onClose }) {
  if (!flightId) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-slate-900 p-6 border-l border-slate-700/50 w-96">
        Histórico (implementação completa em Task 4.4)
      </div>
    </div>
  );
}
