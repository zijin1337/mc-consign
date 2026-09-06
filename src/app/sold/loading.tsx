import { PageHeaderSkeleton, TableSkeleton } from "@/components/skeleton";

export default function SoldLoading() {
  return (
    <div data-skeleton="sold" aria-busy="true" aria-label="加载中">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} title={false} flush />
    </div>
  );
}
