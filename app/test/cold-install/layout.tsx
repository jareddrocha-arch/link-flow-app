/**
 * Layout only — access control is on the page (needs searchParams for ?key=).
 */
export default function ColdInstallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
