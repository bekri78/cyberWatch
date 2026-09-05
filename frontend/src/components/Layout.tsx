import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function Layout({
  title,
  subtitle,
  status,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-marketing">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} subtitle={subtitle} status={status} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-[26px] px-[26px] pt-[22px] pb-12 max-[760px]:px-3.5 max-[760px]:pt-4 max-[760px]:pb-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
