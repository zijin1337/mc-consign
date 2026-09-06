export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="加载中" className="space-y-8">
      <div className="space-y-3">
        <div className="skel h-3 w-32" />
        <div className="skel h-9 w-56" />
      </div>
      <div className="border border-white/10 bg-card">
        <div className="mc-rule px-5 py-3">
          <div className="skel h-3 w-full" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-6 border-b border-white/[0.06] px-5 py-3.5 last:border-b-0">
            <div className="skel h-4 w-10" />
            <div className="skel h-4 flex-1" />
            <div className="skel h-4 w-24" />
            <div className="skel h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
