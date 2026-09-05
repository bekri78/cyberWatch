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
    <div className="cw-app">
      <Sidebar />
      <div className="cw-main">
        <Header title={title} subtitle={subtitle} status={status} />
        <div className="cw-scroll">
          <div className="cw-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
